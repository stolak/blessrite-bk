import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";
import { deleteCache, deleteCacheByPrefix, getCache, setCache } from "../utils/fileCache";

export interface SubClassData {
  id: string;
  name: string;
  status: Status;
  classId: string | null;
  createdAt: Date;
  updatedAt: Date;
  class?: { id: string; name: string } | null;
}

export interface ListSubClassesParams {
  q?: string;
  classId?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

type ListSubClassesResult = {
  subClasses: SubClassData[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const CACHE_PREFIX = "sub-classes";
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
  classId?: string;
  q?: string;
}): string {
  const status = params.status ?? "Active";
  const classId = (params.classId ?? "-").trim();
  const q = (params.q ?? "").trim().toLowerCase();
  return `${CACHE_PREFIX}.list.p${params.page}.l${params.limit}.s${status}.c${classId}.q${q || "-"}`;
}

function itemCacheKey(id: string): string {
  return `${CACHE_PREFIX}.id.${id}`;
}

async function invalidateSubClassCache(id?: string): Promise<void> {
  await deleteCacheByPrefix(`${CACHE_PREFIX}.list`);
  if (id) {
    await deleteCache(itemCacheKey(id));
  } else {
    await deleteCacheByPrefix(`${CACHE_PREFIX}.id`);
  }
}

export class SubClassService {
  private prisma = prisma;

  private async assertClassExists(classId: string) {
    const cls = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!cls) throw new Error("Invalid classId");
  }

  async createSubClass(input: {
    name: string;
    classId?: string | null;
    status?: Status;
  }): Promise<SubClassData> {
    if (input.classId) await this.assertClassExists(input.classId);

    try {
      const created = await this.prisma.subClass.create({
        data: {
          name: input.name,
          classId: input.classId ?? null,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: { class: { select: { id: true, name: true } } },
      });

      await invalidateSubClassCache(created.id);
      await setCache(itemCacheKey(created.id), created, ITEM_TTL_SECONDS);

      return created;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SubClass name already exists for this class");
      }
      throw e;
    }
  }

  async listSubClasses(params: ListSubClassesParams = {}): Promise<ListSubClassesResult> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;
    const cacheKey = listCacheKey({
      page,
      limit,
      status: params.status,
      classId: params.classId,
      q: params.q,
    });

    const cached = await getCache<ListSubClassesResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: Prisma.SubClassWhereInput = {};

    // Default behavior: only Active unless explicitly overridden.
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.classId) {
      where.classId = params.classId;
    }

    if (params.q) {
      where.OR = [{ name: { contains: params.q } }];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.subClass.count({ where: finalWhere }),
      this.prisma.subClass.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: { class: { select: { id: true, name: true } } },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Keep behavior predictable if MySQL collation differs.
    const qLower = params.q?.toLowerCase();
    const subClasses = qLower ? rows.filter((s) => s.name.toLowerCase().includes(qLower)) : rows;

    const result: ListSubClassesResult = {
      subClasses,
      pagination: { page, limit, total, totalPages },
    };

    await setCache(cacheKey, result, LIST_TTL_SECONDS);
    return result;
  }

  async getSubClassById(id: string): Promise<SubClassData | null> {
    const cacheKey = itemCacheKey(id);
    const cached = await getCache<SubClassData>(cacheKey);
    if (cached) {
      return cached;
    }

    const row = await this.prisma.subClass.findUnique({
      where: { id },
      include: { class: { select: { id: true, name: true } } },
    });

    if (row) {
      await setCache(cacheKey, row, ITEM_TTL_SECONDS);
    }

    return row;
  }

  async updateSubClass(
    id: string,
    input: { name?: string; classId?: string | null; status?: Status }
  ): Promise<SubClassData> {
    if (input.classId) await this.assertClassExists(input.classId);

    try {
      const updated = await this.prisma.subClass.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.classId !== undefined ? { classId: input.classId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
        include: { class: { select: { id: true, name: true } } },
      });

      await invalidateSubClassCache(updated.id);
      await setCache(itemCacheKey(updated.id), updated, ITEM_TTL_SECONDS);

      return updated;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SubClass name already exists for this class");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to update not found");
      }
      throw e;
    }
  }

  async deleteSubClass(id: string): Promise<SubClassData> {
    const [studentCount, inventoryTransactionCount, studentBillingCount, studentDiscountCount] =
      await Promise.all([
        this.prisma.student.count({ where: { subClassId: id } }),
        this.prisma.inventoryTransaction.count({ where: { subclassId: id } }),
        this.prisma.studentBilling.count({ where: { subclassId: id } }),
        this.prisma.studentConcessionDiscount.count({ where: { subclassId: id } }),
      ]);

    if (
      studentCount > 0 ||
      inventoryTransactionCount > 0 ||
      studentBillingCount > 0 ||
      studentDiscountCount > 0
    ) {
      const blockers: string[] = [];
      if (studentCount > 0) blockers.push(`students (${studentCount})`);
      if (inventoryTransactionCount > 0)
        blockers.push(`inventory transactions (${inventoryTransactionCount})`);
      if (studentBillingCount > 0) blockers.push(`student billings (${studentBillingCount})`);
      if (studentDiscountCount > 0) blockers.push(`student discounts (${studentDiscountCount})`);

      throw new Error(`Cannot delete subclass because it is referenced by: ${blockers.join(", ")}`);
    }

    try {
      const deleted = await this.prisma.subClass.delete({
        where: { id },
        include: { class: { select: { id: true, name: true } } },
      });

      await invalidateSubClassCache(id);
      return deleted;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to delete does not exist");
      }
      throw e;
    }
  }
}

export const subClassService = new SubClassService();
