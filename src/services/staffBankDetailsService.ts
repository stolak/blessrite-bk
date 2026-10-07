import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

const staffBankDetailsInclude = {
  staff: { select: { id: true, name: true, StaffNumber: true, email: true } },
  bank: { select: { id: true, bankCode: true, bankName: true } },
} satisfies Prisma.StaffBankDetailsInclude;

export type StaffBankDetailsWithRelations = Prisma.StaffBankDetailsGetPayload<{
  include: typeof staffBankDetailsInclude;
}>;

export interface ListStaffBankDetailsParams {
  staffId?: string;
  bankId?: string;
  isPrimary?: boolean;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

export interface StaffBankDetailsInput {
  bankId: string;
  accountNumber: string;
  isPrimary?: boolean;
  status?: Status;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: string }).code === "string";
}

export class StaffBankDetailsService {
  private prisma = prisma;

  private async assertStaffExists(staffId: string): Promise<void> {
    const row = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!row) throw new Error("Invalid staffId");
  }

  private async assertBankExists(bankId: string): Promise<void> {
    const row = await this.prisma.bank.findUnique({ where: { id: bankId }, select: { id: true } });
    if (!row) throw new Error("Invalid bankId");
  }

  private normalizeAccountNumber(accountNumber: string): string {
    const trimmed = accountNumber.trim();
    if (!trimmed) throw new Error("accountNumber is required");
    return trimmed;
  }

  private async clearPrimaryForStaff(
    tx: Prisma.TransactionClient,
    staffId: string,
    excludeId?: string
  ): Promise<void> {
    await tx.staffBankDetails.updateMany({
      where: {
        staffId,
        isPrimary: true,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      data: { isPrimary: false },
    });
  }

  async create(input: {
    staffId: string;
    bankId: string;
    accountNumber: string;
    isPrimary?: boolean;
    status?: Status;
  }): Promise<StaffBankDetailsWithRelations> {
    await this.assertStaffExists(input.staffId);
    await this.assertBankExists(input.bankId);
    const accountNumber = this.normalizeAccountNumber(input.accountNumber);
    const isPrimary = input.isPrimary ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await this.clearPrimaryForStaff(tx, input.staffId);
      }

      return tx.staffBankDetails.create({
        data: {
          staffId: input.staffId,
          bankId: input.bankId,
          accountNumber,
          isPrimary,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: staffBankDetailsInclude,
      });
    });
  }

  async createBulk(input: {
    staffId: string;
    banks: StaffBankDetailsInput[];
  }): Promise<StaffBankDetailsWithRelations[]> {
    if (!input.banks.length) {
      throw new Error("banks is required and must be a non-empty array");
    }

    await this.assertStaffExists(input.staffId);

    const bankIds = [...new Set(input.banks.map((b) => b.bankId.trim()))];
    for (const bankId of bankIds) {
      await this.assertBankExists(bankId);
    }

    const primaryCount = input.banks.filter((b) => b.isPrimary === true).length;
    if (primaryCount > 1) {
      throw new Error("Only one bank entry in banks may have isPrimary true");
    }

    const normalized = input.banks.map((b, idx) => {
      const bankId = b.bankId?.trim();
      if (!bankId) throw new Error(`banks[${idx}].bankId is required`);
      const accountNumber = this.normalizeAccountNumber(b.accountNumber ?? "");
      return {
        bankId,
        accountNumber,
        isPrimary: b.isPrimary ?? false,
        status: b.status,
      };
    });

    const hasPrimary = normalized.some((b) => b.isPrimary);

    return this.prisma.$transaction(async (tx) => {
      if (hasPrimary) {
        await this.clearPrimaryForStaff(tx, input.staffId);
      }

      const created: StaffBankDetailsWithRelations[] = [];
      for (const row of normalized) {
        const item = await tx.staffBankDetails.create({
          data: {
            staffId: input.staffId,
            bankId: row.bankId,
            accountNumber: row.accountNumber,
            isPrimary: row.isPrimary,
            ...(row.status !== undefined ? { status: row.status } : {}),
          },
          include: staffBankDetailsInclude,
        });
        created.push(item);
      }
      return created;
    });
  }

  async list(params: ListStaffBankDetailsParams = {}): Promise<{
    staffBankDetails: StaffBankDetailsWithRelations[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StaffBankDetailsWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.staffId?.trim()) where.staffId = params.staffId.trim();
    if (params.bankId?.trim()) where.bankId = params.bankId.trim();
    if (params.isPrimary !== undefined) where.isPrimary = params.isPrimary;

    const [total, rows] = await Promise.all([
      this.prisma.staffBankDetails.count({ where }),
      this.prisma.staffBankDetails.findMany({
        where,
        orderBy: [{ isPrimary: "desc" }, { accountNumber: "asc" }],
        skip,
        take: limit,
        include: staffBankDetailsInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { staffBankDetails: rows, pagination: { page, limit, total, totalPages } };
  }

  async getById(id: string): Promise<StaffBankDetailsWithRelations | null> {
    return this.prisma.staffBankDetails.findUnique({
      where: { id },
      include: staffBankDetailsInclude,
    });
  }

  async update(
    id: string,
    input: {
      bankId?: string;
      accountNumber?: string;
      isPrimary?: boolean;
      status?: Status;
    }
  ): Promise<StaffBankDetailsWithRelations> {
    const existing = await this.prisma.staffBankDetails.findUnique({
      where: { id },
      select: { id: true, staffId: true },
    });
    if (!existing) throw new Error("Staff bank details not found");

    if (input.bankId !== undefined) {
      await this.assertBankExists(input.bankId);
    }

    let accountNumber: string | undefined;
    if (input.accountNumber !== undefined) {
      accountNumber = this.normalizeAccountNumber(input.accountNumber);
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.clearPrimaryForStaff(tx, existing.staffId, id);
      }

      try {
        return await tx.staffBankDetails.update({
          where: { id },
          data: {
            ...(input.bankId !== undefined ? { bankId: input.bankId } : {}),
            ...(accountNumber !== undefined ? { accountNumber } : {}),
            ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
          include: staffBankDetailsInclude,
        });
      } catch (e) {
        if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
          throw new Error("Staff bank details not found");
        }
        throw e;
      }
    });
  }

  async delete(id: string): Promise<StaffBankDetailsWithRelations> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Staff bank details not found");

    try {
      return await this.prisma.staffBankDetails.delete({
        where: { id },
        include: staffBankDetailsInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Staff bank details not found");
      }
      throw e;
    }
  }
}

export const staffBankDetailsService = new StaffBankDetailsService();
