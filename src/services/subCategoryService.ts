import prisma from "../utils/prisma";
import { CategoryData } from "./categoryService";
import { Status } from "@prisma/client";
import { deleteCache, deleteCacheByPrefix, getCache, setCache } from "../utils/fileCache";

export interface SubCategoryData {
  id: string;
  category?: CategoryData | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSubCategoriesParams {
  q?: string;
  categoryId?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

type ListSubCategoriesResult = {
  subCategories: SubCategoryData[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const CACHE_PREFIX = "sub-categories";
const LIST_TTL_SECONDS = 600; // 10 minutes
const ITEM_TTL_SECONDS = 600;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

function listCacheKey(params: {
  page: number;
  limit: number;
  status?: Status | "All";
  categoryId?: string;
  q?: string;
}): string {
  const status = params.status ?? "Active";
  const categoryId = (params.categoryId ?? "-").trim();
  const q = (params.q ?? "").trim().toLowerCase();
  return `${CACHE_PREFIX}.list.p${params.page}.l${params.limit}.s${status}.c${categoryId}.q${q || "-"}`;
}

function itemCacheKey(id: string): string {
  return `${CACHE_PREFIX}.id.${id}`;
}

async function invalidateSubCategoryCache(id?: string): Promise<void> {
  await deleteCacheByPrefix(`${CACHE_PREFIX}.list`);
  if (id) {
    await deleteCache(itemCacheKey(id));
  } else {
    await deleteCacheByPrefix(`${CACHE_PREFIX}.id`);
  }
}

export class SubCategoryService {
  private prisma = prisma;

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new Error("Invalid categoryId");
  }

  async createSubCategory(input: {
    name: string;
    description?: string | null;
    categoryId: string;
    status?: Status;
  }): Promise<SubCategoryData> {
    try {
      await this.assertCategoryExists(input.categoryId);

      const created = await this.prisma.subCategory.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await invalidateSubCategoryCache(created.id);
      await setCache(itemCacheKey(created.id), created, ITEM_TTL_SECONDS);

      return created;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SubCategory name already exists for this category");
      }
      throw e;
    }
  }

  async listSubCategories(params: ListSubCategoriesParams = {}): Promise<ListSubCategoriesResult> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;
    const cacheKey = listCacheKey({
      page,
      limit,
      status: params.status,
      categoryId: params.categoryId,
      q: params.q,
    });

    const cached = await getCache<ListSubCategoriesResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    // Default behavior: only Active unless explicitly overridden.
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q) {
      where.name = { contains: params.q };
    }
    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.subCategory.count({ where: finalWhere }),
      this.prisma.subCategory.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: {
          category: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Keep behavior predictable if MySQL collation differs.
    const subCategories = params.q
      ? rows.filter((sc) => sc.name.toLowerCase().includes(params.q!.toLowerCase()))
      : rows;

    const result: ListSubCategoriesResult = {
      subCategories,
      pagination: { page, limit, total, totalPages },
    };

    await setCache(cacheKey, result, LIST_TTL_SECONDS);
    return result;
  }

  async getSubCategoryById(id: string): Promise<SubCategoryData | null> {
    const cacheKey = itemCacheKey(id);
    const cached = await getCache<SubCategoryData>(cacheKey);
    if (cached) {
      return cached;
    }

    const row = await this.prisma.subCategory.findUnique({ where: { id } });

    if (row) {
      await setCache(cacheKey, row, ITEM_TTL_SECONDS);
    }

    return row;
  }

  async updateSubCategory(
    id: string,
    input: { name?: string; description?: string | null; categoryId?: string; status?: Status }
  ): Promise<SubCategoryData> {
    try {
      if (input.categoryId !== undefined) {
        await this.assertCategoryExists(input.categoryId);
      }

      const updated = await this.prisma.subCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
      });

      await invalidateSubCategoryCache(updated.id);
      await setCache(itemCacheKey(updated.id), updated, ITEM_TTL_SECONDS);

      return updated;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SubCategory name already exists for this category");
      }
      throw e;
    }
  }

  async deleteSubCategory(id: string): Promise<SubCategoryData> {
    const inventoryItemCount = await this.prisma.inventoryItem.count({
      where: { subCategoryId: id },
    });

    if (inventoryItemCount > 0) {
      throw new Error("Cannot delete subcategory because it is referenced by inventory items");
    }

    const deleted = await this.prisma.subCategory.delete({ where: { id } });
    await invalidateSubCategoryCache(id);
    return deleted;
  }
}

export const subCategoryService = new SubCategoryService();
