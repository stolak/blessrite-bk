import { AccountType, Prisma, Status } from "@prisma/client";
import prisma from "../utils/prisma";

const accountChartInclude = {
  group: true,
  head: true,
  subhead: true,
} satisfies Prisma.AccountChartInclude;

export type AccountChartWithRelations = Prisma.AccountChartGetPayload<{
  include: typeof accountChartInclude;
}>;

export type ListAccountChartsFilters = {
  groupId?: number;
  headId?: number;
  subheadId?: number;
  status?: Status | "All";
  accountType?: AccountType;
};

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "string"
  );
}

export class AccountChartService {
  private prisma = prisma;

  async resolveFromSubheadId(
    subheadId: number
  ): Promise<{ groupId: number; headId: number } | null> {
    const sub = await this.prisma.accountSubhead.findUnique({
      where: { id: subheadId },
      select: { groupId: true, headId: true },
    });
    return sub ?? null;
  }

  /** Same description cannot repeat under one subhead (trimmed exact match). */
  private async assertDescriptionUniqueForSubhead(
    subheadId: number,
    accountDescription: string,
    excludeId?: number
  ): Promise<void> {
    const existing = await this.prisma.accountChart.findFirst({
      where: {
        subheadId,
        accountDescription,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An account chart with this description already exists for this subhead");
    }
  }

  /** When set, account number must be unique across all charts. */
  private async assertAccountNoGloballyUnique(
    accountNo: string,
    excludeId?: number
  ): Promise<void> {
    const trimmed = accountNo.trim();
    if (!trimmed) {
      throw new Error("Account number is optional; if provided it cannot be blank");
    }
    const existing = await this.prisma.accountChart.findFirst({
      where: {
        accountNo: trimmed,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An account chart with this account number already exists");
    }
  }

  /** `accountNo` is optional; when omitted or blank it is stored as null. If set, it must be globally unique. */
  async create(input: {
    subheadId: number;
    accountDescription: string;
    accountNo?: string | null;
    accountRef?: string | null;
    status?: Status;
    rank?: number;
  }): Promise<AccountChartWithRelations> {
    const descTrimmed =
      typeof input.accountDescription === "string" ? input.accountDescription.trim() : "";
    if (!descTrimmed) {
      throw new Error("accountDescription is required");
    }

    const resolved = await this.resolveFromSubheadId(input.subheadId);
    if (!resolved) {
      throw new Error("Invalid subheadId: account subhead not found");
    }

    await this.assertDescriptionUniqueForSubhead(input.subheadId, descTrimmed);

    const accountNoValue: string | null =
      input.accountNo !== undefined &&
      input.accountNo !== null &&
      String(input.accountNo).trim().length > 0
        ? String(input.accountNo).trim()
        : null;
    if (accountNoValue !== null) {
      await this.assertAccountNoGloballyUnique(accountNoValue);
    }

    const row = await this.prisma.accountChart.create({
      data: {
        groupId: resolved.groupId,
        headId: resolved.headId,
        subheadId: input.subheadId,
        accountDescription: descTrimmed,
        rank: input.rank ?? 0,
        accountNo: accountNoValue,
        ...(input.accountRef !== undefined ? { accountRef: input.accountRef } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      } as Prisma.AccountChartUncheckedCreateInput,
      include: accountChartInclude,
    });
    return row as AccountChartWithRelations;
  }

  async list(filters: ListAccountChartsFilters = {}): Promise<AccountChartWithRelations[]> {
    const where: Prisma.AccountChartWhereInput = {};
    if (filters.groupId !== undefined) {
      where.groupId = filters.groupId;
    }
    if (filters.headId !== undefined) {
      where.headId = filters.headId;
    }
    if (filters.subheadId !== undefined) {
      where.subheadId = filters.subheadId;
    }
    if (filters.status === undefined) {
      where.status = Status.Active;
    } else if (filters.status !== "All") {
      where.status = filters.status;
    }
    if (filters.accountType !== undefined) {
      where.subhead = { accountType: filters.accountType };
    }

    return this.prisma.accountChart.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: accountChartInclude,
      orderBy: [
        { headId: "asc" },
        { subheadId: "asc" },
        { rank: "asc" },
        { accountNo: "asc" },
        { accountDescription: "asc" },
      ],
    });
  }

  async getById(id: number): Promise<AccountChartWithRelations | null> {
    return this.prisma.accountChart.findUnique({
      where: { id },
      include: accountChartInclude,
    });
  }

  async update(
    id: number,
    input: {
      subheadId?: number;
      accountDescription?: string;
      accountNo?: string | null;
      accountRef?: string | null;
      status?: Status;
      rank?: number;
    }
  ): Promise<AccountChartWithRelations> {
    const current = await this.prisma.accountChart.findUnique({
      where: { id },
      select: { subheadId: true, accountDescription: true },
    });
    if (!current) {
      throw new Error("Account chart not found");
    }

    if (input.subheadId !== undefined || input.accountDescription !== undefined) {
      const targetSubheadId = input.subheadId ?? current.subheadId;
      const targetDescription =
        input.accountDescription !== undefined
          ? input.accountDescription.trim()
          : current.accountDescription;
      if (!targetDescription.trim()) {
        throw new Error("accountDescription cannot be empty");
      }
      await this.assertDescriptionUniqueForSubhead(targetSubheadId, targetDescription, id);
    }

    let resolvedSubhead: { groupId: number; headId: number } | null = null;
    if (input.subheadId !== undefined) {
      resolvedSubhead = await this.resolveFromSubheadId(input.subheadId);
      if (!resolvedSubhead) {
        throw new Error("Invalid subheadId: account subhead not found");
      }
    }

    if (input.accountNo !== undefined) {
      if (input.accountNo === null || String(input.accountNo).trim() === "") {
        // clear — no uniqueness check
      } else {
        await this.assertAccountNoGloballyUnique(String(input.accountNo), id);
      }
    }

    const data: Prisma.AccountChartUpdateInput = {};

    if (input.subheadId !== undefined && resolvedSubhead) {
      data.group = { connect: { id: resolvedSubhead.groupId } };
      data.head = { connect: { id: resolvedSubhead.headId } };
      data.subhead = { connect: { id: input.subheadId } };
    }

    if (input.accountDescription !== undefined) {
      data.accountDescription = input.accountDescription.trim();
    }
    if (input.accountNo !== undefined) {
      const nextAccountNo =
        input.accountNo === null || String(input.accountNo).trim() === ""
          ? null
          : String(input.accountNo).trim();
      Object.assign(data, { accountNo: nextAccountNo });
    }
    if (input.accountRef !== undefined) {
      data.accountRef = input.accountRef;
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.rank !== undefined) {
      data.rank = input.rank;
    }

    try {
      const row = await this.prisma.accountChart.update({
        where: { id },
        data: data as Prisma.AccountChartUpdateInput,
        include: accountChartInclude,
      });
      return row as AccountChartWithRelations;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Account chart not found");
      }
      throw e;
    }
  }

  async delete(id: number): Promise<AccountChartWithRelations> {
    // validate if the account chart is referenced by any transactions or journal lines
    const transactions = await this.prisma.accountTransaction.findMany({
      where: { accountId: id },
    });
    if (transactions.length > 0) {
      throw new Error("Account chart cannot be deleted while transactions reference it");
    }
    const journalLines = await this.prisma.studentJournalTransfer.findMany({
      where: { accountId: id },
    });
    if (journalLines.length > 0) {
      throw new Error("Account chart cannot be deleted while journal lines reference it");
    }

    try {
      return await this.prisma.accountChart.delete({
        where: { id },
        include: accountChartInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Account chart not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error(
          "Cannot delete: account chart is referenced by transactions or journal lines"
        );
      }
      throw e;
    }
  }
}

export const accountChartService = new AccountChartService();
