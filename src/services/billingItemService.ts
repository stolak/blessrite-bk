import prisma from "../utils/prisma";
import { BillingItemCategory, Prisma, Status } from "@prisma/client";

const billingItemListInclude = {
  account: { select: { id: true, accountDescription: true } },
} satisfies Prisma.BillingItemInclude;

export type BillingItemRow = Prisma.BillingItemGetPayload<Record<string, never>>;

export interface ListBillingItemsParams {
  q?: string;
  category?: BillingItemCategory;
  accountId?: number;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class BillingItemService {
  private prisma = prisma;

  private async validateAccountId(accountId?: number | null): Promise<void> {
    if (accountId === undefined || accountId === null) {
      return;
    }
    if (!Number.isInteger(accountId) || accountId < 1) {
      throw new Error("accountId must be a positive integer when provided");
    }
    const account = await this.prisma.accountChart.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) {
      throw new Error("Invalid accountId: account chart not found");
    }
  }

  async createBillingItem(input: {
    code: string;
    name: string;
    category: BillingItemCategory;
    accountId?: number | null;
    optional?: boolean;
    status?: Status;
  }): Promise<BillingItemRow> {
    try {
      await this.validateAccountId(input.accountId);

      return await this.prisma.billingItem.create({
        data: {
          code: input.code,
          name: input.name,
          category: input.category,
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
          ...(input.optional !== undefined ? { optional: input.optional } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Billing item code already exists");
      }
      throw e;
    }
  }

  async listBillingItems(params: ListBillingItemsParams = {}): Promise<{
    billingItems: BillingItemRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.BillingItemWhereInput = {};

    if (params.category !== undefined) {
      where.category = params.category;
    }
    if (params.accountId !== undefined) {
      where.accountId = params.accountId;
    }

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q) {
      where.OR = [{ name: { contains: params.q } }, { code: { contains: params.q } }];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.billingItem.count({ where: finalWhere }),
      this.prisma.billingItem.findMany({
        where: finalWhere,
        include: billingItemListInclude,
        orderBy: [{ category: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      billingItems: rows,
      pagination: { page, limit, total, totalPages },
    };
  }

  async getBillingItemById(id: number): Promise<BillingItemRow | null> {
    return this.prisma.billingItem.findUnique({ where: { id } });
  }

  async updateBillingItem(
    id: number,
    input: {
      code?: string;
      name?: string;
      category?: BillingItemCategory;
      accountId?: number | null;
      optional?: boolean;
      status?: Status;
    }
  ): Promise<BillingItemRow> {
    try {
      if (input.accountId !== undefined) {
        await this.validateAccountId(input.accountId);
      }

      return await this.prisma.billingItem.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
          ...(input.optional !== undefined ? { optional: input.optional } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Billing item code already exists");
      }
      throw e;
    }
  }

  async deleteBillingItem(id: number): Promise<BillingItemRow> {
    try {
      return await this.prisma.billingItem.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete billing item because it is referenced");
      }
      throw e;
    }
  }
}

export const billingItemService = new BillingItemService();
