import { Prisma, Status } from "@prisma/client";
import prisma from "../utils/prisma";

export type AccountTransactionRow = Prisma.AccountTransactionGetPayload<Record<string, never>>;

function endOfUtcDay(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
}

function startOfUtcMonthContaining(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Default window: first day of current UTC month 00:00 through end of today UTC. */
function defaultMonthIntervalToToday(): { from: Date; to: Date } {
  const now = new Date();
  return { from: startOfUtcMonthContaining(now), to: endOfUtcDay(now) };
}

function decimalNetBalance(
  sumDebit: Prisma.Decimal | null,
  sumCredit: Prisma.Decimal | null
): string {
  const debit = sumDebit ?? new Prisma.Decimal(0);
  const credit = sumCredit ?? new Prisma.Decimal(0);
  return debit.minus(credit).toString();
}

export interface AccountTransactionLogParams {
  accountId: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
}

export interface AccountBalanceAsAtDateParams {
  accountId: string;
  asAtDate?: Date;
}

export interface AccountBalanceAsAtDateResult {
  account: {
    id: number;
    accountNo: string | null;
    accountRef: string | null;
    accountDescription: string;
    group: { id: number; name: string };
    head: { id: number; name: string };
    subhead: { id: number; name: string };
  };
  asAtDate: Date;
  /** Sum(credit) − sum(debit) for rows with transactionDate <= asAtDate. */
  balanceAsAtDate: string;
}

export interface StaffAccountBalanceAsAtDateParams {
  staffId: string;
  asAtDate?: Date;
}

export interface StaffAccountBalanceAsAtDateResult {
  staffId: string;
  asAtDate: Date;
  /** Sum(credit) − sum(debit) for rows with transactionDate <= asAtDate and accountSub = staffId. */
  balanceAsAtDate: string;
  sumCredit: string;
  sumDebit: string;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export interface ListStaffBalancesParams {
  asAtDate?: Date;
  status?: Status;
  departmentId?: string;
  gradeLevelId?: string;
  orderBy?: "name" | "StaffNumber" | "balance";
  orderDirection?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface StaffBalanceRow {
  staffId: string;
  StaffNumber: string;
  name: string;
  email: string;
  position: string;
  status: Status;
  departmentId: string | null;
  gradeLevelId: string | null;
  department: { id: string; name: string } | null;
  gradeLevel: { id: string; name: string } | null;
  sumCredit: string;
  sumDebit: string;
  balance: string;
}

export interface ListStaffBalancesResult {
  asAtDate: Date;
  status: Status | "All";
  orderBy: "name" | "StaffNumber" | "balance";
  orderDirection: "asc" | "desc";
  rows: StaffBalanceRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type AccountTransactionLogRow = {
  id: number;
  debit: string;
  credit: string;
  remarks: string | null;
  ref: string | null;
  manualRef: string | null;
  transactionDate: Date;
  postedBy: string | null;
  createdAt: Date;
  projectId: string | null;
};

export interface AccountTransactionLogResult {
  account: {
    id: number;
    accountNo: string | null;
    accountRef: string | null;
    accountDescription: string;
    group: { id: number; name: string };
    head: { id: number; name: string };
    subhead: { id: number; name: string };
  };
  transactionDateFrom: Date;
  transactionDateTo: Date;
  /** Sum(debit) − sum(credit) with transactionDate strictly before `transactionDateFrom`. */
  balanceBeforeFromDate: string;
  transactions: AccountTransactionLogRow[];
}

export interface StaffAccountTransactionLogParams {
  staffId: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
}

export interface StaffAccountTransactionLogResult {
  staff: {
    id: string;
    StaffNumber: string;
    name: string;
    email: string;
    position: string;
    departmentId: string | null;
    gradeLevelId: string | null;
  };
  transactionDateFrom: Date;
  transactionDateTo: Date;
  /** Sum(credit) − sum(debit) with transactionDate strictly before `transactionDateFrom`. */
  balanceBeforeDateFrom: string;
  transactions: AccountTransactionLogRow[];
}

export interface AccountTransactionByAccountReportParams {
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
}

export type AccountTransactionByAccountReportRow = {
  accountId: number;
  headId: number;
  subheadId: number;
  sumCreditMinusDebit: string;
  account: {
    id: number;
    groupId: number;
    headId: number;
    subheadId: number;
    rank: number;
    accountNo: string | null;
    accountRef: string | null;
    accountDescription: string;
    group: { id: number; name: string };
    head: { id: number; code: string; name: string };
    subhead: { id: number; code: string | null; name: string; rank: number };
  };
};

export interface AccountTransactionByAccountReportResult {
  transactionDateFrom: Date | null;
  transactionDateTo: Date | null;
  rows: AccountTransactionByAccountReportRow[];
}

export type AccountTransactionHeadSubheadRow = {
  name: string;
  headcode: number | string;
  subheads: Array<{
    id: number;
    name: string;
    balance: number;
  }>;
};

export type AccountTransactionByHeadSubheadReportResult = Record<
  string,
  AccountTransactionHeadSubheadRow
>;

/** Seeded chart of accounts — Expenses (group 4 / head 6) and Incomes (group 5 / head 7). */
export const PL_EXPENSE_GROUP_ID = 4;
export const PL_INCOME_GROUP_ID = 5;
export const PL_EXPENSE_HEAD_ID = 6;
export const PL_INCOME_HEAD_ID = 7;

export interface ProfitAndLossLine {
  accountId: number;
  accountNo: string | null;
  accountRef: string | null;
  accountDescription: string;
  subheadId: number;
  subheadName: string;
  subheadCode: string | null;
  amount: string;
}

export interface ProfitAndLossSubheadTotal {
  subheadId: number;
  subheadName: string;
  subheadCode: string | null;
  amount: string;
}

export interface ProfitAndLossSection {
  groupId: number;
  groupName: string;
  headId: number;
  headCode: string;
  headName: string;
  lines: ProfitAndLossLine[];
  subheadTotals: ProfitAndLossSubheadTotal[];
  total: string;
}

export interface ProfitAndLossReportResult {
  transactionDateFrom: Date | null;
  transactionDateTo: Date | null;
  income: ProfitAndLossSection;
  expenses: ProfitAndLossSection;
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  resultLabel: "Net Profit" | "Net Loss";
}

/** Seeded chart — balance sheet groups (Assets, Liabilities, Equity). */
export const BS_ASSET_GROUP_ID = 1;
export const BS_LIABILITY_GROUP_ID = 2;
export const BS_EQUITY_GROUP_ID = 3;
export const BS_CURRENT_ASSET_HEAD_ID = 1;
export const BS_FIXED_ASSET_HEAD_ID = 2;
export const BS_CURRENT_LIABILITY_HEAD_ID = 3;
export const BS_LONG_TERM_LIABILITY_HEAD_ID = 4;

export type CashFlowActivity = "operating" | "investing" | "financing" | "unclassified";

export interface CashFlowActivitySection {
  inflows: string;
  outflows: string;
  net: string;
}

export interface CashFlowAccountLine {
  accountId: number;
  accountNo: string | null;
  accountDescription: string;
  openingBalance: string;
  inflows: string;
  outflows: string;
  closingBalance: string;
}

export interface CashFlowReportResult {
  transactionDateFrom: Date | null;
  transactionDateTo: Date | null;
  openingCashBalance: string;
  closingCashBalance: string;
  netChangeInCash: string;
  operatingActivities: CashFlowActivitySection;
  investingActivities: CashFlowActivitySection;
  financingActivities: CashFlowActivitySection;
  unclassifiedActivities: CashFlowActivitySection;
  cashAccounts: CashFlowAccountLine[];
  reconciled: boolean;
  reconciliationDifference: string;
}

export interface BalanceSheetParams {
  asAtDate?: Date;
}

export interface BalanceSheetLine {
  accountId: number;
  accountNo: string | null;
  accountRef: string | null;
  accountDescription: string;
  subheadId: number;
  subheadName: string;
  subheadCode: string | null;
  balance: string;
}

export interface BalanceSheetSubheadTotal {
  subheadId: number;
  subheadName: string;
  subheadCode: string | null;
  balance: string;
}

export interface BalanceSheetHeadSection {
  headId: number;
  headCode: string;
  headName: string;
  lines: BalanceSheetLine[];
  subheadTotals: BalanceSheetSubheadTotal[];
  total: string;
}

export interface BalanceSheetGroupSection {
  groupId: number;
  groupName: string;
  heads: BalanceSheetHeadSection[];
  total: string;
}

export interface BalanceSheetReportResult {
  asAtDate: Date;
  assets: BalanceSheetGroupSection;
  liabilities: BalanceSheetGroupSection;
  equity: BalanceSheetGroupSection;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
  balancingDifference: string;
}

type EntryInput = {
  accountId: string;
  amount: number;
  ref: string;
  manualRef: string;
  transactionDate: string;
  postedBy: string;
  projectId?: string;
  accountSub?: string;
  remarks: string;
};

type DbClient = Pick<Prisma.TransactionClient, "accountChart" | "accountTransaction">;

export class AccountTransactionService {
  private prisma = prisma;

  private defaultYearIntervalToToday(): { from: Date; to: Date } {
    const now = new Date();
    const to = endOfUtcDay(now);
    const from = new Date(
      Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );
    return { from, to };
  }

  async listStaffBalances(params: ListStaffBalancesParams = {}): Promise<ListStaffBalancesResult> {
    const asAtDate = params.asAtDate ?? endOfUtcDay(new Date());
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const orderDirection = params.orderDirection ?? "asc";
    const orderBy = params.orderBy ?? "name";
    const skip = (page - 1) * limit;

    const where: Prisma.StaffWhereInput = {
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.departmentId !== undefined ? { departmentId: params.departmentId } : {}),
      ...(params.gradeLevelId !== undefined ? { gradeLevelId: params.gradeLevelId } : {}),
    };

    const total = await this.prisma.staff.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (total === 0) {
      return {
        asAtDate,
        status: params.status ?? "All",
        orderBy,
        orderDirection,
        rows: [],
        pagination: { page, limit, total, totalPages },
      };
    }

    const staffSelect = Prisma.validator<Prisma.StaffSelect>()({
      id: true,
      StaffNumber: true,
      name: true,
      email: true,
      position: true,
      status: true,
      departmentId: true,
      gradeLevelId: true,
      department: { select: { id: true, name: true } },
      gradeLevel: { select: { id: true, name: true } },
    });

    const staffList =
      orderBy === "balance"
        ? await this.prisma.staff.findMany({
            where,
            select: staffSelect,
          })
        : await this.prisma.staff.findMany({
            where,
            skip,
            take: limit,
            orderBy:
              orderBy === "StaffNumber"
                ? [{ StaffNumber: orderDirection }, { name: "asc" }]
                : [{ name: orderDirection }, { StaffNumber: "asc" }],
            select: staffSelect,
          });

    const staffIds = staffList.map((x) => x.id);

    const balances =
      staffIds.length === 0
        ? []
        : await this.prisma.accountTransaction.groupBy({
            by: ["accountSub"],
            where: {
              accountSub: { in: staffIds },
              transactionDate: { lte: asAtDate },
            },
            _sum: { credit: true, debit: true },
          });

    const balanceMap = new Map<
      string,
      { credit: Prisma.Decimal; debit: Prisma.Decimal; balance: Prisma.Decimal }
    >();

    for (const row of balances) {
      if (!row.accountSub) continue;
      const credit = row._sum.credit ?? new Prisma.Decimal(0);
      const debit = row._sum.debit ?? new Prisma.Decimal(0);
      balanceMap.set(row.accountSub, {
        credit,
        debit,
        balance: credit.minus(debit),
      });
    }

    const rows: StaffBalanceRow[] = staffList.map((staff) => {
      const sums = balanceMap.get(staff.id) ?? {
        credit: new Prisma.Decimal(0),
        debit: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
      };

      return {
        staffId: staff.id,
        StaffNumber: staff.StaffNumber,
        name: staff.name,
        email: staff.email,
        position: staff.position,
        status: staff.status,
        departmentId: staff.departmentId,
        gradeLevelId: staff.gradeLevelId,
        department: staff.department ? { id: staff.department.id, name: staff.department.name } : null,
        gradeLevel: staff.gradeLevel ? { id: staff.gradeLevel.id, name: staff.gradeLevel.name } : null,
        sumCredit: sums.credit.toString(),
        sumDebit: sums.debit.toString(),
        balance: sums.balance.toString(),
      };
    });

    if (orderBy === "balance") {
      rows.sort((a, b) => {
        const balanceCmp = new Prisma.Decimal(a.balance).comparedTo(new Prisma.Decimal(b.balance));

        if (balanceCmp !== 0) {
          return orderDirection === "asc" ? balanceCmp : -balanceCmp;
        }

        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) {
          return nameCmp;
        }

        return a.StaffNumber.localeCompare(b.StaffNumber);
      });
    }

    const pagedRows = orderBy === "balance" ? rows.slice(skip, skip + limit) : rows;

    return {
      asAtDate,
      status: params.status ?? "All",
      orderBy,
      orderDirection,
      rows: pagedRows,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Student account balance as at a date: sum(credit) − sum(debit) from inception through the selected date (inclusive),
   * filtered by `accountSub = studentId`.
   */
  async getStaffAccountBalanceAsAtDate(
    params: StaffAccountBalanceAsAtDateParams
  ): Promise<StaffAccountBalanceAsAtDateResult> {
    const staffId = params.staffId.trim();
    if (!staffId) throw new Error("staffId is required");

    const asAtDate = params.asAtDate ?? endOfUtcDay(new Date());

    const agg = await this.prisma.accountTransaction.aggregate({
      where: {
        accountSub: staffId,
        transactionDate: { lte: asAtDate },
      },
      _sum: { credit: true, debit: true },
    });

    const sumCredit = agg._sum.credit ?? new Prisma.Decimal(0);
    const sumDebit = agg._sum.debit ?? new Prisma.Decimal(0);
    const balanceAsAtDate = sumCredit.minus(sumDebit).toString();

    return {
      staffId,
      asAtDate,
      balanceAsAtDate,
      sumCredit: sumCredit.toString(),
      sumDebit: sumDebit.toString(),
    };
  }

  /**
   * Account balance as at a date: sum(credit) − sum(debit) from inception through the selected date (inclusive).
   */
  async getAccountBalanceAsAtDate(
    params: AccountBalanceAsAtDateParams
  ): Promise<AccountBalanceAsAtDateResult> {
    const accountIdRaw = params.accountId.trim();
    if (!accountIdRaw) throw new Error("accountId is required");

    const accountId = Number.parseInt(accountIdRaw, 10);
    if (!Number.isFinite(accountId) || accountId < 1) {
      throw new Error("accountId must be a positive integer");
    }

    const account = await this.prisma.accountChart.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNo: true,
        accountRef: true,
        accountDescription: true,
        group: { select: { id: true, name: true } },
        head: { select: { id: true, name: true } },
        subhead: { select: { id: true, name: true } },
      },
    });
    if (!account) throw new Error("Account not found for accountId");

    const asAtDate = params.asAtDate ?? endOfUtcDay(new Date());

    const agg = await this.prisma.accountTransaction.aggregate({
      where: {
        accountId,
        transactionDate: { lte: asAtDate },
      },
      _sum: { credit: true, debit: true },
    });

    const sumCredit = agg._sum.credit ?? null;
    const sumDebit = agg._sum.debit ?? null;
    const balanceAsAtDate = decimalNetBalance(sumDebit, sumCredit);

    return {
      account,
      asAtDate,
      balanceAsAtDate,
    };
  }

  /**
   * Grouped report by accountId: sum(credit) − sum(debit), optionally filtered by transaction date range.
   * Ordered by headId, subhead.rank, subheadId, account.rank, accountId.
   */
  async getAccountTransactionByAccountReport(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<AccountTransactionByAccountReportResult> {
    const from = params.transactionDateFrom;
    const to = params.transactionDateTo;

    if (from && to && from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const dateWhere =
      from || to
        ? {
            transactionDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const grouped = await this.prisma.accountTransaction.groupBy({
      by: ["accountId", "headId", "subheadId"],
      ...(Object.keys(dateWhere).length ? { where: dateWhere } : {}),
      _sum: { credit: true, debit: true },
    });

    if (!grouped.length) {
      return {
        transactionDateFrom: from ?? null,
        transactionDateTo: to ?? null,
        rows: [],
      };
    }

    const accountIds = Array.from(new Set(grouped.map((g) => g.accountId)));

    const accounts = await this.prisma.accountChart.findMany({
      where: { id: { in: accountIds } },
      select: {
        id: true,
        groupId: true,
        headId: true,
        subheadId: true,
        rank: true,
        accountNo: true,
        accountRef: true,
        accountDescription: true,
        group: { select: { id: true, name: true } },
        head: { select: { id: true, code: true, name: true } },
        subhead: { select: { id: true, code: true, name: true, rank: true } },
      },
    });

    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows: AccountTransactionByAccountReportRow[] = grouped
      .map((g) => {
        const account = accountById.get(g.accountId);
        if (!account) return null;

        const sumCredit = g._sum.credit ?? new Prisma.Decimal(0);
        const sumDebit = g._sum.debit ?? new Prisma.Decimal(0);
        return {
          accountId: g.accountId,
          headId: g.headId,
          subheadId: g.subheadId,
          sumCreditMinusDebit: sumCredit.minus(sumDebit).toString(),
          account,
        };
      })
      .filter((row): row is AccountTransactionByAccountReportRow => row !== null);

    rows.sort((a, b) => {
      const byHeadId = a.headId - b.headId;
      if (byHeadId !== 0) return byHeadId;

      const bySubheadRank = a.account.subhead.rank - b.account.subhead.rank;
      if (bySubheadRank !== 0) return bySubheadRank;

      const bySubheadId = a.subheadId - b.subheadId;
      if (bySubheadId !== 0) return bySubheadId;

      const byAccountRank = a.account.rank - b.account.rank;
      if (byAccountRank !== 0) return byAccountRank;

      return a.accountId - b.accountId;
    });

    return {
      transactionDateFrom: from ?? null,
      transactionDateTo: to ?? null,
      rows,
    };
  }

  /**
   * Grouped report by subheadId: sum(credit) − sum(debit), optionally filtered by transaction date range.
   * Response is grouped by AccountHead as `headcodeXX` with nested `subheads`.
   */
  async getAccountTransactionByHeadSubheadReport(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<AccountTransactionByHeadSubheadReportResult> {
    const from = params.transactionDateFrom;
    const to = params.transactionDateTo;

    if (from && to && from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const dateWhere =
      from || to
        ? {
            transactionDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const grouped = await this.prisma.accountTransaction.groupBy({
      by: ["headId", "subheadId"],
      ...(Object.keys(dateWhere).length ? { where: dateWhere } : {}),
      _sum: { credit: true, debit: true },
    });

    const balanceByHeadSubhead = new Map<string, number>();
    for (const row of grouped) {
      const credit = row._sum.credit ?? new Prisma.Decimal(0);
      const debit = row._sum.debit ?? new Prisma.Decimal(0);
      balanceByHeadSubhead.set(
        `${row.headId}:${row.subheadId}`,
        Number(credit.minus(debit).toString())
      );
    }

    const heads = await this.prisma.accountHead.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        rank: true,
        subHeads: {
          select: { id: true, name: true, rank: true },
        },
      },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });

    const data: AccountTransactionByHeadSubheadReportResult = {};
    for (const head of heads) {
      const key = `headcode${head.code}`;
      const parsed = Number.parseInt(head.code, 10);

      if (!data[key]) {
        data[key] = {
          name: head.name,
          headcode: Number.isNaN(parsed) ? head.code : parsed,
          subheads: [],
        };
      }

      const sortedSubheads = [...head.subHeads].sort((a, b) => {
        const byRank = a.rank - b.rank;
        if (byRank !== 0) return byRank;
        return a.id - b.id;
      });

      for (const subhead of sortedSubheads) {
        const balance = balanceByHeadSubhead.get(`${head.id}:${subhead.id}`) ?? 0;
        data[key].subheads.push({
          id: subhead.id,
          name: subhead.name,
          balance,
        });
      }
    }

    return data;
  }

  /**
   * Profit & loss for the seeded income (group 5) and expense (group 4) sections.
   * Income line amount = sum(credit) − sum(debit); expense = sum(debit) − sum(credit).
   */
  async getProfitAndLossReport(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<ProfitAndLossReportResult> {
    const from = params.transactionDateFrom;
    const to = params.transactionDateTo;

    if (from && to && from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const dateWhere =
      from || to
        ? {
            transactionDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const grouped = await this.prisma.accountTransaction.groupBy({
      by: ["accountId"],
      where: {
        groupId: { in: [PL_EXPENSE_GROUP_ID, PL_INCOME_GROUP_ID] },
        ...(Object.keys(dateWhere).length ? dateWhere : {}),
      },
      _sum: { credit: true, debit: true },
    });

    const balanceByAccountId = new Map<
      number,
      { credit: Prisma.Decimal; debit: Prisma.Decimal }
    >();
    for (const row of grouped) {
      balanceByAccountId.set(row.accountId, {
        credit: row._sum.credit ?? new Prisma.Decimal(0),
        debit: row._sum.debit ?? new Prisma.Decimal(0),
      });
    }

    const [incomeSection, expenseSection] = await Promise.all([
      this.buildProfitAndLossSection(
        PL_INCOME_GROUP_ID,
        PL_INCOME_HEAD_ID,
        balanceByAccountId,
        "credit"
      ),
      this.buildProfitAndLossSection(
        PL_EXPENSE_GROUP_ID,
        PL_EXPENSE_HEAD_ID,
        balanceByAccountId,
        "debit"
      ),
    ]);

    const totalIncome = new Prisma.Decimal(incomeSection.total);
    const totalExpenses = new Prisma.Decimal(expenseSection.total);
    const net = totalIncome.minus(totalExpenses);

    return {
      transactionDateFrom: from ?? null,
      transactionDateTo: to ?? null,
      income: incomeSection,
      expenses: expenseSection,
      totalIncome: incomeSection.total,
      totalExpenses: expenseSection.total,
      netProfit: net.toString(),
      resultLabel: net.gte(0) ? "Net Profit" : "Net Loss",
    };
  }

  async getProfitAndLossSummary(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<
    Pick<
      ProfitAndLossReportResult,
      | "transactionDateFrom"
      | "transactionDateTo"
      | "totalIncome"
      | "totalExpenses"
      | "netProfit"
      | "resultLabel"
    >
  > {
    const report = await this.getProfitAndLossReport(params);
    return {
      transactionDateFrom: report.transactionDateFrom,
      transactionDateTo: report.transactionDateTo,
      totalIncome: report.totalIncome,
      totalExpenses: report.totalExpenses,
      netProfit: report.netProfit,
      resultLabel: report.resultLabel,
    };
  }

  /**
   * Balance sheet as at a date (inception through asAtDate inclusive).
   * Assets: sum(debit) − sum(credit); liabilities & equity: sum(credit) − sum(debit).
   */
  async getBalanceSheetReport(params: BalanceSheetParams = {}): Promise<BalanceSheetReportResult> {
    const asAtDate = params.asAtDate ?? endOfUtcDay(new Date());

    const grouped = await this.prisma.accountTransaction.groupBy({
      by: ["accountId"],
      where: {
        groupId: { in: [BS_ASSET_GROUP_ID, BS_LIABILITY_GROUP_ID, BS_EQUITY_GROUP_ID] },
        transactionDate: { lte: asAtDate },
      },
      _sum: { credit: true, debit: true },
    });

    const balanceByAccountId = new Map<
      number,
      { credit: Prisma.Decimal; debit: Prisma.Decimal }
    >();
    for (const row of grouped) {
      balanceByAccountId.set(row.accountId, {
        credit: row._sum.credit ?? new Prisma.Decimal(0),
        debit: row._sum.debit ?? new Prisma.Decimal(0),
      });
    }

    const [assets, liabilities, equity] = await Promise.all([
      this.buildBalanceSheetGroupSection(BS_ASSET_GROUP_ID, "debit", balanceByAccountId),
      this.buildBalanceSheetGroupSection(BS_LIABILITY_GROUP_ID, "credit", balanceByAccountId),
      this.buildBalanceSheetGroupSection(BS_EQUITY_GROUP_ID, "credit", balanceByAccountId),
    ]);

    const totalAssets = new Prisma.Decimal(assets.total);
    const totalLiabilities = new Prisma.Decimal(liabilities.total);
    const totalEquity = new Prisma.Decimal(equity.total);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);
    const balancingDifference = totalAssets.minus(totalLiabilitiesAndEquity);

    return {
      asAtDate,
      assets,
      liabilities,
      equity,
      totalAssets: assets.total,
      totalLiabilities: liabilities.total,
      totalEquity: equity.total,
      totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toString(),
      isBalanced: balancingDifference.abs().lte(new Prisma.Decimal("0.01")),
      balancingDifference: balancingDifference.toString(),
    };
  }

  async getBalanceSheetSummary(params: BalanceSheetParams = {}): Promise<
    Pick<
      BalanceSheetReportResult,
      | "asAtDate"
      | "totalAssets"
      | "totalLiabilities"
      | "totalEquity"
      | "totalLiabilitiesAndEquity"
      | "isBalanced"
      | "balancingDifference"
    >
  > {
    const report = await this.getBalanceSheetReport(params);
    return {
      asAtDate: report.asAtDate,
      totalAssets: report.totalAssets,
      totalLiabilities: report.totalLiabilities,
      totalEquity: report.totalEquity,
      totalLiabilitiesAndEquity: report.totalLiabilitiesAndEquity,
      isBalanced: report.isBalanced,
      balancingDifference: report.balancingDifference,
    };
  }

  /**
   * Cash flow for the period: movements on subheads with accountType Cash, classified by
   * paired journal ref (operating / investing / financing) using the non-cash leg.
   */
  async getCashFlowReport(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<CashFlowReportResult> {
    const from = params.transactionDateFrom;
    const to = params.transactionDateTo ?? endOfUtcDay(new Date());

    if (from && to.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const cashAccounts = await this.prisma.accountChart.findMany({
      where: {
        status: "Active",
        subhead: { accountType: "Cash" },
      },
      select: {
        id: true,
        accountNo: true,
        accountDescription: true,
        rank: true,
      },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
    const cashAccountIds = new Set(cashAccounts.map((a) => a.id));

    if (!cashAccountIds.size) {
      throw new Error("Cash flow chart configuration is missing: no Cash subhead accounts found");
    }

    const openingCashBalance = await this.sumCashBalanceThroughDate(
      cashAccountIds,
      from ? new Date(from.getTime() - 1) : undefined
    );
    const closingCashBalance = await this.sumCashBalanceThroughDate(cashAccountIds, to);

    const periodWhere = {
      accountId: { in: [...cashAccountIds] },
      transactionDate: {
        ...(from ? { gte: from } : {}),
        lte: to,
      },
    };

    const cashPeriodRows = await this.prisma.accountTransaction.findMany({
      where: periodWhere,
      select: {
        id: true,
        accountId: true,
        groupId: true,
        headId: true,
        debit: true,
        credit: true,
        ref: true,
      },
    });

    const refs = [
      ...new Set(
        cashPeriodRows.map((r) => r.ref?.trim()).filter((r): r is string => Boolean(r))
      ),
    ];

    const refLines =
      refs.length > 0
        ? await this.prisma.accountTransaction.findMany({
            where: { ref: { in: refs } },
            select: {
              accountId: true,
              groupId: true,
              headId: true,
              debit: true,
              credit: true,
              ref: true,
            },
          })
        : [];

    const linesByRef = new Map<string, typeof refLines>();
    for (const line of refLines) {
      const key = line.ref?.trim();
      if (!key) continue;
      const bucket = linesByRef.get(key) ?? [];
      bucket.push(line);
      linesByRef.set(key, bucket);
    }

    const activityTotals: Record<CashFlowActivity, { inflows: Prisma.Decimal; outflows: Prisma.Decimal }> =
      {
        operating: { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) },
        investing: { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) },
        financing: { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) },
        unclassified: { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) },
      };

    const accountPeriod = new Map<
      number,
      { inflows: Prisma.Decimal; outflows: Prisma.Decimal }
    >();
    for (const id of cashAccountIds) {
      accountPeriod.set(id, { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) });
    }

    for (const row of cashPeriodRows) {
      const debit = row.debit ?? new Prisma.Decimal(0);
      const credit = row.credit ?? new Prisma.Decimal(0);
      const inflow = debit.gt(0) ? debit : new Prisma.Decimal(0);
      const outflow = credit.gt(0) ? credit : new Prisma.Decimal(0);

      const bucket = accountPeriod.get(row.accountId);
      if (bucket) {
        bucket.inflows = bucket.inflows.plus(inflow);
        bucket.outflows = bucket.outflows.plus(outflow);
      }

      const refKey = row.ref?.trim();
      const activity: CashFlowActivity = refKey
        ? this.classifyCashFlowFromRef(linesByRef.get(refKey) ?? [], cashAccountIds)
        : "unclassified";

      activityTotals[activity].inflows = activityTotals[activity].inflows.plus(inflow);
      activityTotals[activity].outflows = activityTotals[activity].outflows.plus(outflow);
    }

    const toSection = (t: { inflows: Prisma.Decimal; outflows: Prisma.Decimal }): CashFlowActivitySection => {
      const net = t.inflows.minus(t.outflows);
      return {
        inflows: t.inflows.toString(),
        outflows: t.outflows.toString(),
        net: net.toString(),
      };
    };

    const operatingActivities = toSection(activityTotals.operating);
    const investingActivities = toSection(activityTotals.investing);
    const financingActivities = toSection(activityTotals.financing);
    const unclassifiedActivities = toSection(activityTotals.unclassified);

    const classifiedNet = new Prisma.Decimal(operatingActivities.net)
      .plus(investingActivities.net)
      .plus(financingActivities.net)
      .plus(unclassifiedActivities.net);

    const netChangeInCash = closingCashBalance.minus(openingCashBalance);
    const reconciliationDifference = netChangeInCash.minus(classifiedNet);

    const cashAccountLines: CashFlowAccountLine[] = [];
    for (const account of cashAccounts) {
      const opening = await this.sumCashBalanceForAccounts(new Set([account.id]), from ? new Date(from.getTime() - 1) : undefined);
      const closing = await this.sumCashBalanceForAccounts(new Set([account.id]), to);
      const period = accountPeriod.get(account.id) ?? {
        inflows: new Prisma.Decimal(0),
        outflows: new Prisma.Decimal(0),
      };
      cashAccountLines.push({
        accountId: account.id,
        accountNo: account.accountNo,
        accountDescription: account.accountDescription,
        openingBalance: opening.toString(),
        inflows: period.inflows.toString(),
        outflows: period.outflows.toString(),
        closingBalance: closing.toString(),
      });
    }

    return {
      transactionDateFrom: from ?? null,
      transactionDateTo: to,
      openingCashBalance: openingCashBalance.toString(),
      closingCashBalance: closingCashBalance.toString(),
      netChangeInCash: netChangeInCash.toString(),
      operatingActivities,
      investingActivities,
      financingActivities,
      unclassifiedActivities,
      cashAccounts: cashAccountLines,
      reconciled: reconciliationDifference.abs().lte(new Prisma.Decimal("0.01")),
      reconciliationDifference: reconciliationDifference.toString(),
    };
  }

  async getCashFlowSummary(
    params: AccountTransactionByAccountReportParams = {}
  ): Promise<
    Pick<
      CashFlowReportResult,
      | "transactionDateFrom"
      | "transactionDateTo"
      | "openingCashBalance"
      | "closingCashBalance"
      | "netChangeInCash"
      | "operatingActivities"
      | "investingActivities"
      | "financingActivities"
      | "unclassifiedActivities"
      | "reconciled"
      | "reconciliationDifference"
    >
  > {
    const report = await this.getCashFlowReport(params);
    return {
      transactionDateFrom: report.transactionDateFrom,
      transactionDateTo: report.transactionDateTo,
      openingCashBalance: report.openingCashBalance,
      closingCashBalance: report.closingCashBalance,
      netChangeInCash: report.netChangeInCash,
      operatingActivities: report.operatingActivities,
      investingActivities: report.investingActivities,
      financingActivities: report.financingActivities,
      unclassifiedActivities: report.unclassifiedActivities,
      reconciled: report.reconciled,
      reconciliationDifference: report.reconciliationDifference,
    };
  }

  private classifyCashFlowActivity(groupId: number, headId: number): CashFlowActivity {
    if (groupId === PL_INCOME_GROUP_ID || groupId === PL_EXPENSE_GROUP_ID) {
      return "operating";
    }
    if (groupId === BS_EQUITY_GROUP_ID) {
      return "financing";
    }
    if (groupId === BS_LIABILITY_GROUP_ID && headId === BS_LONG_TERM_LIABILITY_HEAD_ID) {
      return "financing";
    }
    if (groupId === BS_ASSET_GROUP_ID && headId === BS_FIXED_ASSET_HEAD_ID) {
      return "investing";
    }
    if (groupId === BS_LIABILITY_GROUP_ID || groupId === BS_ASSET_GROUP_ID) {
      return "operating";
    }
    return "unclassified";
  }

  private classifyCashFlowFromRef(
    lines: Array<{
      accountId: number;
      groupId: number;
      headId: number;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
    }>,
    cashAccountIds: Set<number>
  ): CashFlowActivity {
    const nonCash = lines.filter((l) => !cashAccountIds.has(l.accountId));
    if (!nonCash.length) {
      return "unclassified";
    }

    const primary = nonCash.reduce((best, line) => {
      const amount = (line.debit ?? new Prisma.Decimal(0)).plus(line.credit ?? new Prisma.Decimal(0));
      const bestAmount = (best.debit ?? new Prisma.Decimal(0)).plus(best.credit ?? new Prisma.Decimal(0));
      return amount.gt(bestAmount) ? line : best;
    });

    return this.classifyCashFlowActivity(primary.groupId, primary.headId);
  }

  private async sumCashBalanceThroughDate(
    cashAccountIds: Set<number>,
    asAtDate?: Date
  ): Promise<Prisma.Decimal> {
    return this.sumCashBalanceForAccounts(cashAccountIds, asAtDate);
  }

  private async sumCashBalanceForAccounts(
    cashAccountIds: Set<number>,
    asAtDate?: Date
  ): Promise<Prisma.Decimal> {
    if (!cashAccountIds.size) {
      return new Prisma.Decimal(0);
    }

    const agg = await this.prisma.accountTransaction.aggregate({
      where: {
        accountId: { in: [...cashAccountIds] },
        ...(asAtDate !== undefined ? { transactionDate: { lte: asAtDate } } : {}),
      },
      _sum: { debit: true, credit: true },
    });

    const debit = agg._sum.debit ?? new Prisma.Decimal(0);
    const credit = agg._sum.credit ?? new Prisma.Decimal(0);
    return debit.minus(credit);
  }

  private async buildBalanceSheetGroupSection(
    groupId: number,
    normalBalance: "credit" | "debit",
    balanceByAccountId: Map<number, { credit: Prisma.Decimal; debit: Prisma.Decimal }>
  ): Promise<BalanceSheetGroupSection> {
    const group = await this.prisma.accountGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });
    if (!group) {
      throw new Error("Balance sheet chart group configuration is missing or invalid");
    }

    const heads = await this.prisma.accountHead.findMany({
      where: { groupId },
      select: { id: true, code: true, name: true, rank: true },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });

    const headSections: BalanceSheetHeadSection[] = [];
    for (const head of heads) {
      headSections.push(
        await this.buildBalanceSheetHeadSection(groupId, head.id, normalBalance, balanceByAccountId)
      );
    }

    const total = headSections
      .reduce((acc, section) => acc.plus(new Prisma.Decimal(section.total)), new Prisma.Decimal(0))
      .toString();

    return {
      groupId: group.id,
      groupName: group.name,
      heads: headSections,
      total,
    };
  }

  private async buildBalanceSheetHeadSection(
    groupId: number,
    headId: number,
    normalBalance: "credit" | "debit",
    balanceByAccountId: Map<number, { credit: Prisma.Decimal; debit: Prisma.Decimal }>
  ): Promise<BalanceSheetHeadSection> {
    const head = await this.prisma.accountHead.findUnique({
      where: { id: headId },
      select: { id: true, code: true, name: true, groupId: true },
    });
    if (!head || head.groupId !== groupId) {
      throw new Error("Balance sheet chart head configuration is missing or invalid");
    }

    const accounts = await this.prisma.accountChart.findMany({
      where: { groupId, headId, status: "Active" },
      select: {
        id: true,
        accountNo: true,
        accountRef: true,
        accountDescription: true,
        rank: true,
        subheadId: true,
        subhead: { select: { id: true, code: true, name: true, rank: true } },
      },
      orderBy: [{ subhead: { rank: "asc" } }, { rank: "asc" }, { id: "asc" }],
    });

    const lines: BalanceSheetLine[] = accounts.map((account) => {
      const sums = balanceByAccountId.get(account.id) ?? {
        credit: new Prisma.Decimal(0),
        debit: new Prisma.Decimal(0),
      };
      const balance =
        normalBalance === "credit"
          ? sums.credit.minus(sums.debit)
          : sums.debit.minus(sums.credit);

      return {
        accountId: account.id,
        accountNo: account.accountNo,
        accountRef: account.accountRef,
        accountDescription: account.accountDescription,
        subheadId: account.subheadId,
        subheadName: account.subhead.name,
        subheadCode: account.subhead.code,
        balance: balance.toString(),
      };
    });

    const subheadMap = new Map<number, BalanceSheetSubheadTotal>();
    for (const line of lines) {
      const existing = subheadMap.get(line.subheadId);
      const lineBalance = new Prisma.Decimal(line.balance);
      if (existing) {
        subheadMap.set(line.subheadId, {
          ...existing,
          balance: new Prisma.Decimal(existing.balance).plus(lineBalance).toString(),
        });
      } else {
        subheadMap.set(line.subheadId, {
          subheadId: line.subheadId,
          subheadName: line.subheadName,
          subheadCode: line.subheadCode,
          balance: line.balance,
        });
      }
    }

    const subheadTotals = [...subheadMap.values()].sort((a, b) => a.subheadId - b.subheadId);
    const total = lines
      .reduce((acc, line) => acc.plus(new Prisma.Decimal(line.balance)), new Prisma.Decimal(0))
      .toString();

    return {
      headId: head.id,
      headCode: head.code,
      headName: head.name,
      lines,
      subheadTotals,
      total,
    };
  }

  private async buildProfitAndLossSection(
    groupId: number,
    headId: number,
    balanceByAccountId: Map<number, { credit: Prisma.Decimal; debit: Prisma.Decimal }>,
    normalBalance: "credit" | "debit"
  ): Promise<ProfitAndLossSection> {
    const head = await this.prisma.accountHead.findUnique({
      where: { id: headId },
      select: {
        id: true,
        code: true,
        name: true,
        group: { select: { id: true, name: true } },
      },
    });
    if (!head || head.group.id !== groupId) {
      throw new Error("Profit and loss chart head configuration is missing or invalid");
    }

    const accounts = await this.prisma.accountChart.findMany({
      where: { groupId, headId, status: "Active" },
      select: {
        id: true,
        accountNo: true,
        accountRef: true,
        accountDescription: true,
        rank: true,
        subheadId: true,
        subhead: { select: { id: true, code: true, name: true, rank: true } },
      },
      orderBy: [{ subhead: { rank: "asc" } }, { rank: "asc" }, { id: "asc" }],
    });

    const lines: ProfitAndLossLine[] = accounts.map((account) => {
      const sums = balanceByAccountId.get(account.id) ?? {
        credit: new Prisma.Decimal(0),
        debit: new Prisma.Decimal(0),
      };
      const amount =
        normalBalance === "credit"
          ? sums.credit.minus(sums.debit)
          : sums.debit.minus(sums.credit);

      return {
        accountId: account.id,
        accountNo: account.accountNo,
        accountRef: account.accountRef,
        accountDescription: account.accountDescription,
        subheadId: account.subheadId,
        subheadName: account.subhead.name,
        subheadCode: account.subhead.code,
        amount: amount.toString(),
      };
    });

    const subheadMap = new Map<number, ProfitAndLossSubheadTotal>();
    for (const line of lines) {
      const existing = subheadMap.get(line.subheadId);
      const lineAmount = new Prisma.Decimal(line.amount);
      if (existing) {
        subheadMap.set(line.subheadId, {
          ...existing,
          amount: new Prisma.Decimal(existing.amount).plus(lineAmount).toString(),
        });
      } else {
        subheadMap.set(line.subheadId, {
          subheadId: line.subheadId,
          subheadName: line.subheadName,
          subheadCode: line.subheadCode,
          amount: line.amount,
        });
      }
    }

    const subheadTotals = [...subheadMap.values()].sort((a, b) => a.subheadId - b.subheadId);
    const total = lines
      .reduce((acc, line) => acc.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
      .toString();

    return {
      groupId: head.group.id,
      groupName: head.group.name,
      headId: head.id,
      headCode: head.code,
      headName: head.name,
      lines,
      subheadTotals,
      total,
    };
  }

  async getAccountTransactionLog(
    params: AccountTransactionLogParams
  ): Promise<AccountTransactionLogResult> {
    const accountIdRaw = params.accountId.trim();
    if (!accountIdRaw) throw new Error("accountId is required");

    const accountId = Number.parseInt(accountIdRaw, 10);
    if (!Number.isFinite(accountId) || accountId < 1) {
      throw new Error("accountId must be a positive integer");
    }

    const account = await this.prisma.accountChart.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNo: true,
        accountRef: true,
        accountDescription: true,
        group: { select: { id: true, name: true } },
        head: { select: { id: true, name: true } },
        subhead: { select: { id: true, name: true } },
      },
    });
    if (!account) throw new Error("Account not found for accountId");

    let from: Date;
    let to: Date;
    if (params.transactionDateFrom !== undefined && params.transactionDateTo !== undefined) {
      from = params.transactionDateFrom;
      to = params.transactionDateTo;
    } else if (params.transactionDateFrom !== undefined) {
      from = params.transactionDateFrom;
      to = endOfUtcDay(new Date());
    } else if (params.transactionDateTo !== undefined) {
      const t = params.transactionDateTo;
      from = startOfUtcMonthContaining(t);
      to = endOfUtcDay(t);
    } else {
      ({ from, to } = defaultMonthIntervalToToday());
    }

    if (from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const [balanceAgg, rows] = await Promise.all([
      this.prisma.accountTransaction.aggregate({
        where: {
          accountId,
          transactionDate: { lt: from },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.accountTransaction.findMany({
        where: {
          accountId,
          transactionDate: { gte: from, lte: to },
        },
        orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    ]);

    const balanceBeforeFromDate = decimalNetBalance(
      balanceAgg._sum.debit ?? null,
      balanceAgg._sum.credit ?? null
    );

    const transactions: AccountTransactionLogRow[] = rows.map((row) => ({
      id: row.id,
      debit: row.debit.toString(),
      credit: row.credit.toString(),
      remarks: row.remarks,
      ref: row.ref,
      manualRef: row.manualRef,
      transactionDate: row.transactionDate,
      postedBy: row.postedBy,
      createdAt: row.createdAt,
      projectId: row.projectId,
    }));

    return {
      account,
      transactionDateFrom: from,
      transactionDateTo: to,
      balanceBeforeFromDate,
      transactions,
    };
  }

  async getStaffAccountTransactionLog(
    params: StaffAccountTransactionLogParams
  ): Promise<StaffAccountTransactionLogResult> {
    const staffId = params.staffId.trim();
    if (!staffId) throw new Error("staffId is required");

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        StaffNumber: true,
        name: true,
        email: true,
        position: true,
        departmentId: true,
        gradeLevelId: true,
      },
    });
    if (!staff) throw new Error("Staff not found for staffId");

    let from: Date;
    let to: Date;
    if (params.transactionDateFrom !== undefined && params.transactionDateTo !== undefined) {
      from = params.transactionDateFrom;
      to = params.transactionDateTo;
    } else if (params.transactionDateFrom !== undefined) {
      from = params.transactionDateFrom;
      to = endOfUtcDay(new Date());
    } else if (params.transactionDateTo !== undefined) {
      to = params.transactionDateTo;
      from = new Date(
        Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate(), 0, 0, 0, 0)
      );
    } else {
      ({ from, to } = this.defaultYearIntervalToToday());
    }

    if (from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const [balanceAgg, rows] = await Promise.all([
      this.prisma.accountTransaction.aggregate({
        where: {
          accountSub: staffId,
          transactionDate: { lt: from },
        },
        _sum: { credit: true, debit: true },
      }),
      this.prisma.accountTransaction.findMany({
        where: {
          accountSub: staffId,
          transactionDate: { gte: from, lte: to },
        },
        orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    ]);

    const balanceBeforeDateFrom = (balanceAgg._sum.credit ?? new Prisma.Decimal(0))
      .minus(balanceAgg._sum.debit ?? new Prisma.Decimal(0))
      .toString();

    const transactions: AccountTransactionLogRow[] = rows.map((row) => ({
      id: row.id,
      debit: row.debit.toString(),
      credit: row.credit.toString(),
      remarks: row.remarks,
      ref: row.ref,
      manualRef: row.manualRef,
      transactionDate: row.transactionDate,
      postedBy: row.postedBy,
      createdAt: row.createdAt,
      projectId: row.projectId,
    }));

    return {
      staff,
      transactionDateFrom: from,
      transactionDateTo: to,
      balanceBeforeDateFrom,
      transactions,
    };
  }

  async rollBack(ref: string): Promise<{ count: number }> {
    const trimmedRef = ref.trim();
    if (!trimmedRef) {
      throw new Error("ref is required");
    }

    const deleted = await this.prisma.accountTransaction.deleteMany({
      where: { ref: trimmedRef },
    });

    return { count: deleted.count };
  }

  private getDbClient(db?: DbClient): DbClient {
    return db ?? this.prisma;
  }

  private async resolveAccount(db: DbClient, accountIdRaw: string) {
    const accountId = Number.parseInt(accountIdRaw, 10);
    if (!Number.isFinite(accountId) || accountId < 1) {
      throw new Error("accountId must be a positive integer");
    }

    const account = await db.accountChart.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        groupId: true,
        headId: true,
        subheadId: true,
        accountNo: true,
        accountDescription: true,
      },
    });
    if (!account) {
      throw new Error("Account not found for accountId");
    }
    return account;
  }

  private parseDateOrThrow(v: string): Date {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw new Error("transactionDate must be a valid date string");
    }
    return d;
  }

  private async validateProjectId(_db: DbClient, projectId?: string): Promise<void> {
    if (projectId === undefined) return;
    const p = projectId.trim();
    if (!p) {
      throw new Error("projectId cannot be empty when provided");
    }
  }

  private async postEntry(
    type: "debit" | "credit",
    input: EntryInput,
    db?: DbClient
  ): Promise<AccountTransactionRow> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("amount must be a positive number");
    }
    if (!input.ref?.trim()) {
      throw new Error("ref is required");
    }
    if (!input.manualRef?.trim()) {
      throw new Error("manualRef is required");
    }
    if (!input.postedBy?.trim()) {
      throw new Error("postedBy is required");
    }

    const dbClient = this.getDbClient(db);
    const account = await this.resolveAccount(dbClient, input.accountId);
    await this.validateProjectId(dbClient, input.projectId);
    const transactionDate = this.parseDateOrThrow(input.transactionDate);

    const accountCode = account.accountNo?.trim() ?? undefined;
    const accountSub = input.accountSub?.trim() ?? undefined;

    return dbClient.accountTransaction.create({
      data: {
        groupId: account.groupId,
        headId: account.headId,
        subheadId: account.subheadId,
        accountId: account.id,
        accountCode,
        ...(accountSub ? { accountSub } : {}),
        debit: type === "debit" ? input.amount : 0,
        credit: type === "credit" ? input.amount : 0,
        ref: input.ref.trim(),
        manualRef: input.manualRef.trim(),
        transactionDate,
        postedBy: input.postedBy.trim(),
        ...(input.projectId !== undefined ? { projectId: input.projectId.trim() } : {}),
        remarks: input.remarks.trim(),
      },
    });
  }

  async debitAccount(input: EntryInput, db?: DbClient): Promise<AccountTransactionRow> {
    return this.postEntry("debit", input, db);
  }

  async creditAccount(input: EntryInput, db?: DbClient): Promise<AccountTransactionRow> {
    return this.postEntry("credit", input, db);
  }
}

export const accountTransactionService = new AccountTransactionService();
