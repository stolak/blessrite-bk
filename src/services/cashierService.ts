import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface CashierData {
  id: string;
  name: string;
  staffId: string | null;
  userId: string | null;
  accountChartId: number | null;
  status: Status;
  Staff?: {
    id: string;
    name: string;
    StaffNumber: string;
    email: string;
  } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  ledger?: {
    id: number;
    accountNo: string | null;
    accountDescription: string;
  } | null;
}

export interface ListCashiersParams {
  q?: string;
  status?: Status | "All";
  staffId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: string }).code === "string";
}

const cashierInclude = {
  Staff: { select: { id: true, name: true, StaffNumber: true, email: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  ledger: { select: { id: true, accountNo: true, accountDescription: true } },
} satisfies Prisma.CashierInclude;

export class CashierService {
  private prisma = prisma;

  static readonly STAFF_USER_EXCLUSIVE_ERROR =
    "Only one of staffId or userId may be provided in the request, not both";

  private async assertAccountChartExists(accountChartId: number) {
    const account = await this.prisma.accountChart.findUnique({
      where: { id: accountChartId },
      select: { id: true },
    });
    if (!account) throw new Error("Invalid accountChartId");
  }

  /** Resolve paired staffId/userId from staffId only. */
  private async resolveFromStaffId(staffId: string): Promise<{ staffId: string; userId: string | null }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, userId: true },
    });
    if (!staff) throw new Error("Invalid staffId");
    return { staffId: staff.id, userId: staff.userId ?? null };
  }

  /** Resolve paired staffId/userId from userId only. */
  private async resolveFromUserId(userId: string): Promise<{ staffId: string | null; userId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new Error("Invalid userId");

    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      select: { id: true },
    });
    return { staffId: staff?.id ?? null, userId: user.id };
  }

  /**
   * When exactly one of staffId or userId is supplied (non-null), resolve the other from the database.
   * When both are null, clears both links. Caller must reject both being non-null.
   */
  private async resolveStaffUserPair(input: {
    staffId?: string | null;
    userId?: string | null;
  }): Promise<{ staffId: string | null; userId: string | null }> {
    const staffId = input.staffId?.trim() || null;
    const userId = input.userId?.trim() || null;

    if (staffId && userId) {
      throw new Error(CashierService.STAFF_USER_EXCLUSIVE_ERROR);
    }

    if (staffId) {
      return this.resolveFromStaffId(staffId);
    }
    if (userId) {
      return this.resolveFromUserId(userId);
    }
    return { staffId: null, userId: null };
  }

  async createCashier(input: {
    name: string;
    staffId?: string | null;
    userId?: string | null;
    accountChartId?: number | null;
    status?: Status;
  }): Promise<CashierData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    const staffKeyProvided = input.staffId !== undefined;
    const userKeyProvided = input.userId !== undefined;
    if (staffKeyProvided && userKeyProvided) {
      throw new Error(CashierService.STAFF_USER_EXCLUSIVE_ERROR);
    }

    let staffId: string | null = null;
    let userId: string | null = null;
    if (staffKeyProvided || userKeyProvided) {
      const resolved = await this.resolveStaffUserPair({
        ...(staffKeyProvided ? { staffId: input.staffId } : {}),
        ...(userKeyProvided ? { userId: input.userId } : {}),
      });
      staffId = resolved.staffId;
      userId = resolved.userId;
    }

    if (input.accountChartId != null) await this.assertAccountChartExists(input.accountChartId);

    return await this.prisma.cashier.create({
      data: {
        name,
        staffId,
        userId,
        accountChartId: input.accountChartId ?? null,
        status: input.status ?? Status.Active,
      },
      include: cashierInclude,
    });
  }

  async listCashiers(params: ListCashiersParams = {}): Promise<{
    cashiers: CashierData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.CashierWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.staffId?.trim()) {
      where.staffId = params.staffId.trim();
    }
    if (params.userId?.trim()) {
      where.userId = params.userId.trim();
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.cashier.count({ where }),
      this.prisma.cashier.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: cashierInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { cashiers: rows, pagination: { page, limit, total, totalPages } };
  }

  async getCashierById(id: string): Promise<CashierData | null> {
    return await this.prisma.cashier.findUnique({
      where: { id },
      include: cashierInclude,
    });
  }

  async updateCashier(
    id: string,
    input: {
      name?: string;
      staffId?: string | null;
      userId?: string | null;
      accountChartId?: number | null;
      status?: Status;
    }
  ): Promise<CashierData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const staffKeyProvided = input.staffId !== undefined;
    const userKeyProvided = input.userId !== undefined;
    if (staffKeyProvided && userKeyProvided) {
      throw new Error(CashierService.STAFF_USER_EXCLUSIVE_ERROR);
    }

    if (input.accountChartId != null) await this.assertAccountChartExists(input.accountChartId);

    let staffUserData: { staffId?: string | null; userId?: string | null } = {};
    if (staffKeyProvided || userKeyProvided) {
      const resolved = await this.resolveStaffUserPair({
        ...(staffKeyProvided ? { staffId: input.staffId } : {}),
        ...(userKeyProvided ? { userId: input.userId } : {}),
      });
      staffUserData = { staffId: resolved.staffId, userId: resolved.userId };
    }

    try {
      return await this.prisma.cashier.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...staffUserData,
          ...(input.accountChartId !== undefined ? { accountChartId: input.accountChartId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: cashierInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Cashier not found");
      }
      throw e;
    }
  }

  async deleteCashier(id: string): Promise<CashierData> {
    const existing = await this.getCashierById(id);
    if (!existing) throw new Error("Cashier not found");

    try {
      return await this.prisma.cashier.delete({
        where: { id },
        include: cashierInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Cashier not found");
      }
      throw e;
    }
  }
}

export const cashierService = new CashierService();
