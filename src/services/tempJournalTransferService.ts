import { BatchStatus, JournalTransferType, Prisma, Status } from "@prisma/client";
import prisma from "../utils/prisma";
import { generateReferenceNo } from "../utils/referenceNo";
import { accountTransactionService } from "./accountTransactionService";

const tempJournalTransferInclude = {
  account: { select: { id: true, accountDescription: true, accountNo: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TempJournalTransferInclude;

export type TempJournalTransferRow = Prisma.TempJournalTransferGetPayload<Record<string, never>>;

export interface ListTempJournalTransfersParams {
  transType?: JournalTransferType;
  accountId?: number;
  status?: Status | "All";
  batchStatus?: BatchStatus;
  projectId?: string;
  referenceNo?: string;
  manualReferenceNo?: string;
  page?: number;
  limit?: number;
}

export interface ListTempJournalTransfersGroupedByReferenceParams {
  status?: Status | "All";
  batchStatus?: BatchStatus;
}

type CreateTempJournalTransferInput = {
  createdById: string;
  transType: JournalTransferType;
  accountId: number;
  debit?: number;
  credit?: number;
  status?: Status;
  batchStatus?: BatchStatus;
  referenceNo?: string | null;
  manualReferenceNo?: string | null;
  transactionDate: Date;
  postedAt?: Date | null;
  postedBy?: string | null;
  remarks?: string | null;
  finalPostedAt?: Date | null;
  finalPostedBy?: string | null;
  projectId?: string | null;
};

type UpdateTempJournalTransferInput = Partial<CreateTempJournalTransferInput>;
type CreateManyTempJournalTransferInput = {
  createdById: string;
  referenceNo?: string | null;
  entries: Array<Omit<CreateTempJournalTransferInput, "createdById">>;
};
type AppendManyByReferenceNoInput = {
  createdById: string;
  referenceNo: string;
  entries: Array<Omit<CreateTempJournalTransferInput, "createdById" | "referenceNo">>;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class TempJournalTransferService {
  private prisma = prisma;

  private normalizeOptionalString(value?: string | null): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalProjectId(value?: string | null): string | null | undefined {
    const normalized = this.normalizeOptionalString(value);
    if (normalized === undefined || normalized === null) {
      return normalized;
    }
    return normalized;
  }

  private validatePositiveInt(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${fieldName} must be a positive integer`);
    }
  }

  private validateAmount(value: number, fieldName: "debit" | "credit"): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${fieldName} must be a valid number greater than or equal to 0`);
    }
  }

  private validateDebitCreditRule(debit: number, credit: number): void {
    const debitPositive = debit > 0;
    const creditPositive = credit > 0;
    if (debitPositive === creditPositive) {
      throw new Error(
        "Exactly one of debit or credit must be greater than 0, while the other must be 0"
      );
    }
  }

  private validateDate(value: Date, fieldName: string): void {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error(`${fieldName} must be a valid date`);
    }
  }

  private async validateAccountExists(accountId: number): Promise<void> {
    const row = await this.prisma.accountChart.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!row) {
      throw new Error("Invalid accountId: account chart not found");
    }
  }

  private async validateProjectExists(projectId?: string | null): Promise<void> {
    if (projectId === undefined || projectId === null) {
      return;
    }
    const row = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!row) {
      throw new Error("Invalid projectId: project not found");
    }
  }

  private resolveReferenceNo(referenceNo?: string | null): string {
    const normalizedReferenceNo = this.normalizeOptionalString(referenceNo);
    return normalizedReferenceNo && normalizedReferenceNo.length > 0
      ? normalizedReferenceNo
      : generateReferenceNo("TJT");
  }

  private normalizeRequiredUserId(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error("createdById is required");
    }
    return normalized;
  }

  private normalizeRequiredReferenceNo(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error("referenceNo is required");
    }
    return normalized;
  }

  private normalizeRequiredManualReferenceNo(value?: string | null): string {
    const normalized = this.normalizeOptionalString(value);
    if (normalized === undefined || normalized === null) {
      throw new Error("manualReferenceNo is required when batchStatus is Processed");
    }
    return normalized;
  }

  async create(input: CreateTempJournalTransferInput): Promise<TempJournalTransferRow> {
    const createdById = this.normalizeRequiredUserId(input.createdById);
    this.validatePositiveInt(input.accountId, "accountId");
    await this.validateAccountExists(input.accountId);

    const debit = input.debit ?? 0;
    const credit = input.credit ?? 0;
    this.validateAmount(debit, "debit");
    this.validateAmount(credit, "credit");
    this.validateDebitCreditRule(debit, credit);
    this.validateDate(input.transactionDate, "transactionDate");
    if (input.postedAt !== undefined && input.postedAt !== null) {
      this.validateDate(input.postedAt, "postedAt");
    }
    if (input.finalPostedAt !== undefined && input.finalPostedAt !== null) {
      this.validateDate(input.finalPostedAt, "finalPostedAt");
    }

    const projectId = this.normalizeOptionalProjectId(input.projectId);
    const finalReferenceNo = this.resolveReferenceNo(input.referenceNo);
    await this.validateProjectExists(projectId);

    return this.prisma.tempJournalTransfer.create({
      data: {
        transType: input.transType,
        accountId: input.accountId,
        debit,
        credit,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.batchStatus !== undefined ? { batchStatus: input.batchStatus } : {}),
        referenceNo: finalReferenceNo,
        ...(input.manualReferenceNo !== undefined
          ? { manualReferenceNo: this.normalizeOptionalString(input.manualReferenceNo) }
          : {}),
        transactionDate: input.transactionDate,
        ...(input.postedAt !== undefined ? { postedAt: input.postedAt } : {}),
        ...(input.postedBy !== undefined
          ? { postedBy: this.normalizeOptionalString(input.postedBy) }
          : {}),
        ...(input.remarks !== undefined
          ? { remarks: this.normalizeOptionalString(input.remarks) }
          : {}),
        ...(input.finalPostedAt !== undefined ? { finalPostedAt: input.finalPostedAt } : {}),
        ...(input.finalPostedBy !== undefined
          ? { finalPostedBy: this.normalizeOptionalString(input.finalPostedBy) }
          : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        createdById,
      },
    });
  }

  async createMany(
    input: CreateManyTempJournalTransferInput
  ): Promise<{ referenceNo: string; rows: TempJournalTransferRow[] }> {
    const createdById = this.normalizeRequiredUserId(input.createdById);
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      throw new Error("entries must be a non-empty array");
    }

    const finalReferenceNo = this.resolveReferenceNo(input.referenceNo);

    let normalizedEntries = input.entries.map((entry) => {
      this.validatePositiveInt(entry.accountId, "accountId");

      const debit = entry.debit ?? 0;
      const credit = entry.credit ?? 0;
      this.validateAmount(debit, "debit");
      this.validateAmount(credit, "credit");
      this.validateDebitCreditRule(debit, credit);

      this.validateDate(entry.transactionDate, "transactionDate");
      if (entry.postedAt !== undefined && entry.postedAt !== null) {
        this.validateDate(entry.postedAt, "postedAt");
      }
      if (entry.finalPostedAt !== undefined && entry.finalPostedAt !== null) {
        this.validateDate(entry.finalPostedAt, "finalPostedAt");
      }
      const effectiveBatchStatus = entry.batchStatus ?? BatchStatus.Pending;
      const normalizedManualReferenceNo = this.normalizeOptionalString(entry.manualReferenceNo);
      if (effectiveBatchStatus === BatchStatus.Processed) {
        this.normalizeRequiredManualReferenceNo(normalizedManualReferenceNo);
      }

      return {
        transType: entry.transType,
        accountId: entry.accountId,
        debit,
        credit,
        ...(entry.status !== undefined ? { status: entry.status } : {}),
        batchStatus: effectiveBatchStatus,
        ...(normalizedManualReferenceNo !== undefined
          ? { manualReferenceNo: normalizedManualReferenceNo }
          : {}),
        transactionDate: entry.transactionDate,
        ...(entry.postedAt !== undefined ? { postedAt: entry.postedAt } : {}),
        ...(entry.postedBy !== undefined
          ? { postedBy: this.normalizeOptionalString(entry.postedBy) }
          : {}),
        ...(entry.remarks !== undefined
          ? { remarks: this.normalizeOptionalString(entry.remarks) }
          : {}),
        ...(entry.finalPostedAt !== undefined ? { finalPostedAt: entry.finalPostedAt } : {}),
        ...(entry.finalPostedBy !== undefined
          ? { finalPostedBy: this.normalizeOptionalString(entry.finalPostedBy) }
          : {}),
        projectId: this.normalizeOptionalProjectId(entry.projectId),
      };
    });

    const processedEntries = normalizedEntries.filter(
      (entry) => entry.batchStatus === BatchStatus.Processed
    );
    if (processedEntries.length > 0) {
      const totalDebit = processedEntries.reduce(
        (sum, entry) => sum.plus(new Prisma.Decimal(entry.debit)),
        new Prisma.Decimal(0)
      );
      const totalCredit = processedEntries.reduce(
        (sum, entry) => sum.plus(new Prisma.Decimal(entry.credit)),
        new Prisma.Decimal(0)
      );
      if (!totalDebit.equals(totalCredit)) {
        throw new Error(
          "When batchStatus is Processed, total debit must equal total credit for the batch"
        );
      }

      const finalPostedAt = new Date();
      normalizedEntries = normalizedEntries.map((entry) =>
        entry.batchStatus === BatchStatus.Processed
          ? {
              ...entry,
              postedBy: createdById,
              finalPostedBy: createdById,
              finalPostedAt,
            }
          : entry
      );
    }

    const accountIds = [...new Set(normalizedEntries.map((entry) => entry.accountId))];
    const accountCount = await this.prisma.accountChart.count({
      where: { id: { in: accountIds } },
    });
    if (accountCount !== accountIds.length) {
      throw new Error("One or more accountId values are invalid");
    }

    const projectIds = [
      ...new Set(
        normalizedEntries
          .map((entry) => entry.projectId)
          .filter((projectId): projectId is string => projectId !== null && projectId !== undefined)
      ),
    ];
    if (projectIds.length > 0) {
      const projectCount = await this.prisma.project.count({
        where: { id: { in: projectIds } },
      });
      if (projectCount !== projectIds.length) {
        throw new Error("One or more projectId values are invalid");
      }
    }

    const rows = await this.prisma.$transaction(
      normalizedEntries.map((entry) =>
        this.prisma.tempJournalTransfer.create({
          data: {
            ...entry,
            referenceNo: finalReferenceNo,
            createdById,
          },
        })
      )
    );

    if (processedEntries.length > 0) {
      const postedAccountTransactionIds: number[] = [];
      try {
        for (const entry of normalizedEntries) {
          if (entry.batchStatus !== BatchStatus.Processed) {
            continue;
          }

          const manualRef = this.normalizeOptionalString(entry.manualReferenceNo);
          if (!manualRef) {
            throw new Error("manualReferenceNo is required when batchStatus is Processed");
          }

          const debitAmount = Number(entry.debit);
          const creditAmount = Number(entry.credit);
          const amount = debitAmount > 0 ? debitAmount : creditAmount;

          const posted =
            debitAmount > 0
              ? await accountTransactionService.debitAccount({
                  accountId: String(entry.accountId),
                  amount,
                  ref: finalReferenceNo,
                  manualRef,
                  transactionDate: entry.transactionDate.toISOString(),
                  postedBy: createdById,
                  ...(entry.projectId ? { projectId: entry.projectId } : {}),
                  remarks: entry.remarks ?? "",
                })
              : await accountTransactionService.creditAccount({
                  accountId: String(entry.accountId),
                  amount,
                  ref: finalReferenceNo,
                  manualRef,
                  transactionDate: entry.transactionDate.toISOString(),
                  postedBy: createdById,
                  ...(entry.projectId ? { projectId: entry.projectId } : {}),
                  remarks: entry.remarks ?? "",
                });

          postedAccountTransactionIds.push(posted.id);
        }
      } catch (error) {
        if (postedAccountTransactionIds.length > 0) {
          await this.prisma.accountTransaction.deleteMany({
            where: { id: { in: postedAccountTransactionIds } },
          });
        }
        await this.prisma.tempJournalTransfer.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        });
        throw error;
      }
    }

    return { referenceNo: finalReferenceNo, rows };
  }

  async appendManyByReferenceNo(
    input: AppendManyByReferenceNoInput
  ): Promise<{ referenceNo: string; rows: TempJournalTransferRow[] }> {
    const referenceNo = this.normalizeRequiredReferenceNo(input.referenceNo);

    const existing = await this.prisma.tempJournalTransfer.findFirst({
      where: { referenceNo },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Temp journal transfer referenceNo not found");
    }

    return this.createMany({
      createdById: input.createdById,
      referenceNo,
      entries: input.entries,
    });
  }

  async list(params: ListTempJournalTransfersParams = {}): Promise<{
    tempJournalTransfers: Array<
      Prisma.TempJournalTransferGetPayload<{ include: typeof tempJournalTransferInclude }>
    >;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TempJournalTransferWhereInput = {};
    if (params.transType !== undefined) where.transType = params.transType;
    if (params.accountId !== undefined) where.accountId = params.accountId;
    if (params.batchStatus !== undefined) where.batchStatus = params.batchStatus;
    if (params.projectId !== undefined) where.projectId = params.projectId;
    if (params.referenceNo !== undefined) where.referenceNo = { contains: params.referenceNo };
    if (params.manualReferenceNo !== undefined) {
      where.manualReferenceNo = { contains: params.manualReferenceNo };
    }

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.tempJournalTransfer.count({ where: finalWhere }),
      this.prisma.tempJournalTransfer.findMany({
        where: finalWhere,
        include: tempJournalTransferInclude,
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return {
      tempJournalTransfers: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listGroupedByReferenceNo(
    params: ListTempJournalTransfersGroupedByReferenceParams = {}
  ): Promise<
    Array<{
      referenceNo: string;
      batchStatus: BatchStatus;
      totalDebit: Prisma.Decimal;
      totalCredit: Prisma.Decimal;
      count: number;
      latestTransactionDate: Date | null;
      manualReferenceNos: string[];
      postedBy: Array<{ id: string; name: string | null }>;
    }>
  > {
    const where: Prisma.TempJournalTransferWhereInput = {
      referenceNo: { not: null },
    };
    if (params.batchStatus !== undefined) {
      where.batchStatus = params.batchStatus;
    }
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    const rows = await this.prisma.tempJournalTransfer.groupBy({
      by: ["referenceNo", "batchStatus"],
      where,
      _sum: { debit: true, credit: true },
      _count: { _all: true },
      _max: { transactionDate: true },
      orderBy: [{ _max: { transactionDate: "desc" } }, { referenceNo: "asc" }],
    });

    const referenceNos = [
      ...new Set(
        rows
          .map((row) => row.referenceNo)
          .filter((referenceNo): referenceNo is string => !!referenceNo)
      ),
    ];

    const detailsByGroup = new Map<
      string,
      { manualReferenceNos: Set<string>; postedByIds: Set<string> }
    >();

    if (referenceNos.length > 0) {
      const detailRows = await this.prisma.tempJournalTransfer.findMany({
        where: {
          ...where,
          referenceNo: { in: referenceNos },
        },
        select: {
          referenceNo: true,
          batchStatus: true,
          manualReferenceNo: true,
          postedBy: true,
        },
      });

      for (const row of detailRows) {
        if (!row.referenceNo) continue;
        const key = `${row.referenceNo}::${row.batchStatus}`;
        const existing = detailsByGroup.get(key) ?? {
          manualReferenceNos: new Set<string>(),
          postedByIds: new Set<string>(),
        };
        if (row.manualReferenceNo && row.manualReferenceNo.trim()) {
          existing.manualReferenceNos.add(row.manualReferenceNo.trim());
        }
        if (row.postedBy && row.postedBy.trim()) {
          existing.postedByIds.add(row.postedBy.trim());
        }
        detailsByGroup.set(key, existing);
      }
    }

    const allPostedByIds = [
      ...new Set(
        Array.from(detailsByGroup.values()).flatMap((value) => Array.from(value.postedByIds))
      ),
    ];
    const usersById = new Map<
      string,
      { id: string; firstName: string | null; lastName: string | null }
    >();
    if (allPostedByIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: allPostedByIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const user of users) {
        usersById.set(user.id, user);
      }
    }

    return rows.map((row) => ({
      referenceNo: row.referenceNo ?? "",
      batchStatus: row.batchStatus,
      totalDebit: row._sum.debit ?? new Prisma.Decimal(0),
      totalCredit: row._sum.credit ?? new Prisma.Decimal(0),
      count: row._count._all,
      latestTransactionDate: row._max.transactionDate ?? null,
      manualReferenceNos: Array.from(
        detailsByGroup.get(`${row.referenceNo ?? ""}::${row.batchStatus}`)?.manualReferenceNos ?? []
      ),
      postedBy: Array.from(
        detailsByGroup.get(`${row.referenceNo ?? ""}::${row.batchStatus}`)?.postedByIds ?? []
      ).map((id) => {
        const user = usersById.get(id);
        const name = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "";
        return {
          id,
          name: name || null,
        };
      }),
    }));
  }

  async getById(id: number): Promise<TempJournalTransferRow | null> {
    return this.prisma.tempJournalTransfer.findUnique({ where: { id } });
  }

  async update(id: number, input: UpdateTempJournalTransferInput): Promise<TempJournalTransferRow> {
    if (input.accountId !== undefined) {
      this.validatePositiveInt(input.accountId, "accountId");
      await this.validateAccountExists(input.accountId);
    }
    if (input.debit !== undefined) this.validateAmount(input.debit, "debit");
    if (input.credit !== undefined) this.validateAmount(input.credit, "credit");
    if (input.transactionDate !== undefined)
      this.validateDate(input.transactionDate, "transactionDate");
    if (input.postedAt !== undefined && input.postedAt !== null)
      this.validateDate(input.postedAt, "postedAt");
    if (input.finalPostedAt !== undefined && input.finalPostedAt !== null) {
      this.validateDate(input.finalPostedAt, "finalPostedAt");
    }

    if (input.debit !== undefined || input.credit !== undefined) {
      const existing = await this.prisma.tempJournalTransfer.findUnique({
        where: { id },
        select: { debit: true, credit: true },
      });
      if (!existing) {
        throw new Error("Temp journal transfer not found");
      }
      const effectiveDebit = input.debit ?? Number(existing.debit);
      const effectiveCredit = input.credit ?? Number(existing.credit);
      this.validateDebitCreditRule(effectiveDebit, effectiveCredit);
    }

    let projectId: string | null | undefined = undefined;
    if (input.projectId !== undefined) {
      projectId = this.normalizeOptionalProjectId(input.projectId);
      await this.validateProjectExists(projectId);
    }

    return this.prisma.tempJournalTransfer.update({
      where: { id },
      data: {
        ...(input.transType !== undefined ? { transType: input.transType } : {}),
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        ...(input.debit !== undefined ? { debit: input.debit } : {}),
        ...(input.credit !== undefined ? { credit: input.credit } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.batchStatus !== undefined ? { batchStatus: input.batchStatus } : {}),
        ...(input.referenceNo !== undefined
          ? { referenceNo: this.normalizeOptionalString(input.referenceNo) }
          : {}),
        ...(input.manualReferenceNo !== undefined
          ? { manualReferenceNo: this.normalizeOptionalString(input.manualReferenceNo) }
          : {}),
        ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
        ...(input.postedAt !== undefined ? { postedAt: input.postedAt } : {}),
        ...(input.postedBy !== undefined
          ? { postedBy: this.normalizeOptionalString(input.postedBy) }
          : {}),
        ...(input.remarks !== undefined
          ? { remarks: this.normalizeOptionalString(input.remarks) }
          : {}),
        ...(input.finalPostedAt !== undefined ? { finalPostedAt: input.finalPostedAt } : {}),
        ...(input.finalPostedBy !== undefined
          ? { finalPostedBy: this.normalizeOptionalString(input.finalPostedBy) }
          : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: number): Promise<TempJournalTransferRow> {
    return this.prisma.tempJournalTransfer.delete({ where: { id } });
  }

  async deleteByReferenceNo(referenceNo: string): Promise<{ count: number }> {
    const normalizedReferenceNo = this.normalizeRequiredReferenceNo(referenceNo);
    const deleted = await this.prisma.tempJournalTransfer.deleteMany({
      where: { referenceNo: normalizedReferenceNo },
    });
    return { count: deleted.count };
  }
}

export const tempJournalTransferService = new TempJournalTransferService();
