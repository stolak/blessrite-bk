import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";
import { accountTransactionService } from "./accountTransactionService";
import { defaultAccountSettingsService } from "./defaultAccountSettingsService";
import { generateReferenceNo } from "../utils/referenceNo";

const expenseInclude = {
  administrativeExpenseComponent: {
    select: {
      id: true,
      name: true,
      status: true,
      accountId: true,
      account: { select: { id: true, accountDescription: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.AdministrativeExpenseInclude;

type ExpenseRow = Prisma.AdministrativeExpenseGetPayload<{ include: typeof expenseInclude }>;

export interface AdministrativeExpenseData {
  id: string;
  status: Status;
  administrativeExpenseComponentId: string;
  administrativeExpenseComponent: ExpenseRow["administrativeExpenseComponent"];
  amount: string;
  transactionDate: Date;
  remarks: string | null;
  referenceNo: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  createdBy: ExpenseRow["createdBy"];
  updatedById: string | null;
  updatedBy: ExpenseRow["updatedBy"];
}

export interface ListAdministrativeExpensesParams {
  q?: string;
  status?: Status | "All";
  administrativeExpenseComponentId?: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  );
}

function parseAmount(value: string | number): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error("amount must be zero or greater");
  }
  return d;
}

function mapRow(row: ExpenseRow): AdministrativeExpenseData {
  return {
    id: row.id,
    status: row.status,
    administrativeExpenseComponentId: row.administrativeExpenseComponentId,
    administrativeExpenseComponent: row.administrativeExpenseComponent,
    amount: row.amount.toString(),
    transactionDate: row.transactionDate,
    remarks: row.remarks,
    referenceNo: row.referenceNo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdById: row.createdById,
    createdBy: row.createdBy,
    updatedById: row.updatedById,
    updatedBy: row.updatedBy,
  };
}

export class AdministrativeExpenseService {
  private prisma = prisma;

  private async assertComponentExists(componentId: string): Promise<void> {
    const row = await this.prisma.administrativeExpenseComponent.findUnique({
      where: { id: componentId },
      select: { id: true },
    });
    if (!row) {
      throw new Error("Invalid administrativeExpenseComponentId: component not found");
    }
  }

  private buildListWhere(
    params: ListAdministrativeExpensesParams
  ): Prisma.AdministrativeExpenseWhereInput {
    const where: Prisma.AdministrativeExpenseWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.administrativeExpenseComponentId) {
      where.administrativeExpenseComponentId = params.administrativeExpenseComponentId;
    }

    if (params.transactionDateFrom !== undefined || params.transactionDateTo !== undefined) {
      where.transactionDate = {
        ...(params.transactionDateFrom !== undefined ? { gte: params.transactionDateFrom } : {}),
        ...(params.transactionDateTo !== undefined ? { lte: params.transactionDateTo } : {}),
      };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ referenceNo: { contains: q } }, { remarks: { contains: q } }];
    }

    return where;
  }

  async create(input: {
    administrativeExpenseComponentId: string;
    amount: string | number;
    transactionDate: Date;
    status?: Status;
    remarks?: string | null;
    referenceNo?: string | null;
    createdById?: string | null;
  }): Promise<AdministrativeExpenseData> {
    const componentId = input.administrativeExpenseComponentId.trim();
    if (!componentId) {
      throw new Error("administrativeExpenseComponentId is required");
    }

    await this.assertComponentExists(componentId);

    const referenceNo = generateReferenceNo("ADM");

    const row = await this.prisma.$transaction(async (tx) => {
      const defaultAccountSettings =
        await defaultAccountSettingsService.getAccountChartBySettingsId(
          "ADMINISTRATIVE_ASSET_ACCOUNT",
          tx
        );
      // if input.referenceNo?.trim() exist verify if is unique
      if (input.referenceNo?.trim()) {
        const existing = await tx.administrativeExpense.findFirst({
          where: { referenceNo: input.referenceNo?.trim() },
        });
        if (existing) {
          throw new Error("Reference number must be unique for administrative expenses");
        }
      }
      const created = await tx.administrativeExpense.create({
        data: {
          administrativeExpenseComponentId: componentId,
          amount: parseAmount(input.amount),
          transactionDate: input.transactionDate,
          remarks:
            input.remarks === undefined || input.remarks === null
              ? null
              : input.remarks.trim() || null,
          referenceNo,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.createdById !== undefined ? { createdById: input.createdById } : {}),
        },
        include: expenseInclude,
      });

      const componentAccountId = created.administrativeExpenseComponent.accountId;
      if (componentAccountId === null || componentAccountId === undefined) {
        throw new Error("Administrative expense component has no accountId configured");
      }

      const createdById = created.createdById?.trim() ?? "";
      if (!createdById) {
        throw new Error("createdById is required to post account transactions");
      }

      const remarks = created.remarks ?? "";
      const transactionDate = created.transactionDate.toISOString();
      const manualRef = input.referenceNo?.trim() || referenceNo;
      const amount = Number(created.amount);

      await accountTransactionService.debitAccount(
        {
          accountId: String(componentAccountId),
          amount,
          transactionDate,
          ref: referenceNo,
          manualRef,
          remarks,
          postedBy: createdById,
        },
        tx
      );
      await accountTransactionService.creditAccount(
        {
          accountId: String(defaultAccountSettings.accountId),
          amount,
          transactionDate,
          ref: referenceNo,
          manualRef,
          remarks,
          postedBy: createdById,
        },
        tx
      );

      return created;
    });

    return mapRow(row);
  }

  async list(params: ListAdministrativeExpensesParams = {}): Promise<{
    administrativeExpenses: AdministrativeExpenseData[];
    count: number;
  }> {
    if (
      params.transactionDateFrom !== undefined &&
      params.transactionDateTo !== undefined &&
      params.transactionDateFrom.getTime() > params.transactionDateTo.getTime()
    ) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const rows = await this.prisma.administrativeExpense.findMany({
      where: this.buildListWhere(params),
      include: expenseInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });

    return {
      administrativeExpenses: rows.map(mapRow),
      count: rows.length,
    };
  }

  async getById(id: string): Promise<AdministrativeExpenseData | null> {
    const row = await this.prisma.administrativeExpense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      status?: Status;
      administrativeExpenseComponentId?: string;
      amount?: string | number;
      transactionDate?: Date;
      remarks?: string | null;
      referenceNo?: string | null;
      updatedById?: string | null;
    }
  ): Promise<AdministrativeExpenseData> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Administrative expense not found");
    }

    if (input.administrativeExpenseComponentId !== undefined) {
      const componentId = input.administrativeExpenseComponentId.trim();
      if (!componentId) {
        throw new Error("administrativeExpenseComponentId cannot be empty");
      }
      await this.assertComponentExists(componentId);
    }

    try {
      const row = await this.prisma.administrativeExpense.update({
        where: { id },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.administrativeExpenseComponentId !== undefined
            ? { administrativeExpenseComponentId: input.administrativeExpenseComponentId.trim() }
            : {}),
          ...(input.amount !== undefined ? { amount: parseAmount(input.amount) } : {}),
          ...(input.transactionDate !== undefined
            ? { transactionDate: input.transactionDate }
            : {}),
          ...(input.remarks !== undefined
            ? {
                remarks:
                  input.remarks === null
                    ? null
                    : input.remarks.trim()
                      ? input.remarks.trim()
                      : null,
              }
            : {}),
          ...(input.referenceNo !== undefined
            ? {
                referenceNo:
                  input.referenceNo === null
                    ? null
                    : input.referenceNo.trim()
                      ? input.referenceNo.trim()
                      : null,
              }
            : {}),
          ...(input.updatedById !== undefined ? { updatedById: input.updatedById } : {}),
        },
        include: expenseInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Administrative expense not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Invalid administrativeExpenseComponentId: component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AdministrativeExpenseData> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Administrative expense not found");
    }

    try {
      const row = await this.prisma.administrativeExpense.delete({
        where: { id },
        include: expenseInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Administrative expense not found");
      }
      throw e;
    }
  }
}

export const administrativeExpenseService = new AdministrativeExpenseService();
