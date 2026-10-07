import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface SessionData {
  id: string;
  name: string;
  status: Status;
  createdAt: Date;
}

export interface ListSessionsParams {
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

export class SessionService {
  private prisma = prisma;

  async createSession(input: { name: string; status?: Status }): Promise<SessionData> {
    try {
      return await this.prisma.session.create({
        data: {
          name: input.name,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Session name already exists");
      }
      throw e;
    }
  }

  async listSessions(params: ListSessionsParams = {}): Promise<{
    sessions: SessionData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {};

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
      this.prisma.session.count({ where: finalWhere }),
      this.prisma.session.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Keep behavior predictable if MySQL collation differs.
    const qLower = params.q?.toLowerCase();
    const sessions = qLower ? rows.filter((s) => s.name.toLowerCase().includes(qLower)) : rows;

    return { sessions, pagination: { page, limit, total, totalPages } };
  }

  async getSessionById(id: string): Promise<SessionData | null> {
    return await this.prisma.session.findUnique({ where: { id } });
  }

  async updateSession(
    id: string,
    input: { name?: string; status?: Status }
  ): Promise<SessionData> {
    try {
      return await this.prisma.session.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Session name already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to update not found");
      }
      throw e;
    }
  }

  async deleteSession(id: string): Promise<SessionData> {
    const [activePeriodCount, defaultBillingPeriodCount, inventoryTransactionCount, studentBillingCount, studentDiscountCount] =
      await Promise.all([
        this.prisma.activePeriod.count({ where: { sessionId: id } }),
        this.prisma.defaultBillingPeriod.count({ where: { sessionId: id } }),
        this.prisma.inventoryTransaction.count({ where: { sessionId: id } }),
        this.prisma.studentBilling.count({ where: { session: id } }),
        this.prisma.studentConcessionDiscount.count({ where: { session: id } }),
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

      throw new Error(`Cannot delete session because it is referenced by: ${blockers.join(", ")}`);
    }

    try {
      return await this.prisma.session.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to delete does not exist");
      }
      throw e;
    }
  }
}

export const sessionService = new SessionService();

