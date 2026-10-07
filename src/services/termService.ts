import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface TermData {
  id: string;
  name: string;
  status: Status;
  createdAt: Date;
}

export interface ListTermsParams {
  q?: string;
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

export class TermService {
  private prisma = prisma;

  async createTerm(input: { name: string; status?: Status }): Promise<TermData> {
    try {
      return await this.prisma.term.create({
        data: {
          name: input.name,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Term name already exists");
      }
      throw e;
    }
  }

  async listTerms(params: ListTermsParams = {}): Promise<{
    terms: TermData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TermWhereInput = {};

    // Default behavior: only Active unless explicitly overridden.
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q) {
      where.OR = [{ name: { contains: params.q } }];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.term.count({ where: finalWhere }),
      this.prisma.term.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Keep behavior predictable if MySQL collation differs.
    const qLower = params.q?.toLowerCase();
    const terms = qLower ? rows.filter((t) => t.name.toLowerCase().includes(qLower)) : rows;

    return { terms, pagination: { page, limit, total, totalPages } };
  }

  async getTermById(id: string): Promise<TermData | null> {
    return await this.prisma.term.findUnique({ where: { id } });
  }

  async updateTerm(id: string, input: { name?: string; status?: Status }): Promise<TermData> {
    try {
      return await this.prisma.term.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Term name already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to update not found");
      }
      throw e;
    }
  }

  async deleteTerm(id: string): Promise<TermData> {
    const [activePeriodCount, defaultBillingPeriodCount, inventoryTransactionCount, studentBillingCount, studentDiscountCount] =
      await Promise.all([
        this.prisma.activePeriod.count({ where: { termId: id } }),
        this.prisma.defaultBillingPeriod.count({ where: { termId: id } }),
        this.prisma.inventoryTransaction.count({ where: { termId: id } }),
        this.prisma.studentBilling.count({ where: { term: id } }),
        this.prisma.studentConcessionDiscount.count({ where: { term: id } }),
      ]);

    if (
      activePeriodCount > 0 ||
      defaultBillingPeriodCount > 0 ||
      inventoryTransactionCount > 0 ||
      studentBillingCount > 0 ||
      studentDiscountCount > 0
    ) {
      const blockers: string[] = [];
      if (activePeriodCount > 0) blockers.push(`active periods (${activePeriodCount})`);
      if (defaultBillingPeriodCount > 0)
        blockers.push(`default billing periods (${defaultBillingPeriodCount})`);
      if (inventoryTransactionCount > 0)
        blockers.push(`inventory transactions (${inventoryTransactionCount})`);
      if (studentBillingCount > 0) blockers.push(`student billings (${studentBillingCount})`);
      if (studentDiscountCount > 0) blockers.push(`student discounts (${studentDiscountCount})`);

      throw new Error(`Cannot delete term because it is referenced by: ${blockers.join(", ")}`);
    }

    try {
      return await this.prisma.term.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to delete does not exist");
      }
      throw e;
    }
  }
}

export const termService = new TermService();

