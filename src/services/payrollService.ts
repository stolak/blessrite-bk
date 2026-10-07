import { EmploymentType, Prisma, SalaryComponentType, Status } from "@prisma/client";
import { activePayrollPeriodService } from "./activePayrollPeriodService";
import prisma from "../utils/prisma";
import { defaultAccountSettingsService } from "./defaultAccountSettingsService";
import { accountTransactionService } from "./accountTransactionService";

const staffSalaryChartSelect = {
  gradeLevelId: true,
  step: true,
  employmentType: true,
  componentId: true,
  amount: true,
} satisfies Prisma.SalaryChartSelect;
type StaffSalaryChartRow = Prisma.SalaryChartGetPayload<{ select: typeof staffSalaryChartSelect }>;

const salaryComponentSelect = {
  id: true,
  name: true,
  shortName: true,
  type: true,
  rank: true,
  isTaxable: true,
  isPensionable: true,
  isStatutory: true,
  isFunction: true,
  functionPercentage: true,
  functionElements: true,
} satisfies Prisma.SalaryComponentSelect;

const salaryComponentSelectForPosting = {
  id: true,
  name: true,
  shortName: true,
  type: true,
  rank: true,
  isTaxable: true,
  isPensionable: true,
  isStatutory: true,
  isFunction: true,
  functionPercentage: true,
  functionElements: true,
  accountId: true,
  account: {
    select: {
      id: true,

      group: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.SalaryComponentSelect;
type ActiveSalaryComponent = Prisma.SalaryComponentGetPayload<{
  select: typeof salaryComponentSelect;
}>;

function compareSalaryComponentsByTypeAndRank<
  T extends { type: SalaryComponentType; rank: number; name: string },
>(a: T, b: T): number {
  const typeOrder = (type: SalaryComponentType) => (type === SalaryComponentType.EARNING ? 0 : 1);
  const byType = typeOrder(a.type) - typeOrder(b.type);
  if (byType !== 0) return byType;
  return a.rank - b.rank || a.name.localeCompare(b.name);
}

function sortActiveSalaryComponents(components: ActiveSalaryComponent[]): ActiveSalaryComponent[] {
  return [...components].sort(compareSalaryComponentsByTypeAndRank);
}

function sortPayrollChartRows(rows: StaffPayrollChartRow[]): StaffPayrollChartRow[] {
  return [...rows].sort((a, b) => compareSalaryComponentsByTypeAndRank(a.component, b.component));
}

function salaryChartSlotKey(
  gradeLevelId: string,
  step: number,
  employmentType: EmploymentType
): string {
  return `${gradeLevelId}|${step}|${employmentType}`;
}

function groupSalaryChartsBySlot(rows: StaffSalaryChartRow[]): Map<string, StaffSalaryChartRow[]> {
  const map = new Map<string, StaffSalaryChartRow[]>();
  for (const row of rows) {
    const key = salaryChartSlotKey(row.gradeLevelId, row.step, row.employmentType);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function mapSalaryChartsForStaff(
  staff: {
    gradeLevelId: string | null;
    step: number;
    employmentType: EmploymentType;
  },
  chartsBySlot: Map<string, StaffSalaryChartRow[]>,
  activeSalaryComponents: ActiveSalaryComponent[]
): Array<StaffSalaryChartRow & { component: ActiveSalaryComponent }> {
  if (!staff.gradeLevelId) return [];
  const salaryCharts =
    chartsBySlot.get(salaryChartSlotKey(staff.gradeLevelId, staff.step, staff.employmentType)) ??
    [];

  const activeComponentById = new Map(
    activeSalaryComponents.map((component) => [component.id, component])
  );

  return salaryCharts
    .filter((chart) => activeComponentById.has(chart.componentId))
    .map((chart) => ({
      ...chart,
      component: activeComponentById.get(chart.componentId)!,
    }));
}

type StaffPayrollChartRow = StaffSalaryChartRow & {
  component: ActiveSalaryComponent;
  amount: Prisma.Decimal;
};

const staffSalaryOverrideForProcessSelect = {
  id: true,
  staffId: true,
  componentId: true,
  amount: true,
  isContinuous: true,
  targetAmount: true,
} satisfies Prisma.StaffSalaryOverrideComponentSelect;

type StaffSalaryOverrideForProcess = Prisma.StaffSalaryOverrideComponentGetPayload<{
  select: typeof staffSalaryOverrideForProcessSelect;
}>;

type PayrollOverrideAmountRow = {
  staffId: string;
  componentId: string;
  amount: Prisma.Decimal;
};

/**
 * Resolves payable override amounts from master override rows, persists
 * StaffSalaryProcessOverride for the period, and returns rows for payroll grouping.
 * Call only after deleting process overrides for the same year/month.
 */
async function resolveAndPersistStaffSalaryProcessOverrides(
  tx: Prisma.TransactionClient,
  overrideComponents: StaffSalaryOverrideForProcess[],
  year: number,
  month: number
): Promise<PayrollOverrideAmountRow[]> {
  if (overrideComponents.length === 0) return [];

  const overrideComponentIds = overrideComponents.map((row) => row.id);

  const [existingOneTime, amountSums] = await Promise.all([
    tx.staffSalaryProcessOverride.findMany({
      where: {
        staffSalaryOverrideComponentId: { in: overrideComponentIds },
        status: Status.Active,
      },
      select: { staffSalaryOverrideComponentId: true },
      distinct: ["staffSalaryOverrideComponentId"],
    }),
    tx.staffSalaryProcessOverride.groupBy({
      by: ["staffSalaryOverrideComponentId"],
      where: {
        staffSalaryOverrideComponentId: { in: overrideComponentIds },
        status: Status.Active,
      },
      _sum: { amount: true },
    }),
  ]);

  const hasPriorProcessOverride = new Set(
    existingOneTime.map((row) => row.staffSalaryOverrideComponentId)
  );
  const sumByOverrideComponentId = new Map(
    amountSums.map((row) => [
      row.staffSalaryOverrideComponentId,
      row._sum.amount ?? new Prisma.Decimal(0),
    ])
  );

  const processInserts: Prisma.StaffSalaryProcessOverrideCreateManyInput[] = [];
  const resolvedForPayroll: PayrollOverrideAmountRow[] = [];

  for (const override of overrideComponents) {
    const payable = resolveStaffSalaryProcessOverrideAmount(
      override,
      hasPriorProcessOverride,
      sumByOverrideComponentId
    );
    if (payable == null || payable.lte(0)) continue;

    processInserts.push({
      staffSalaryOverrideComponentId: override.id,
      amount: payable,
      year,
      month,
      status: Status.Active,
    });
    resolvedForPayroll.push({
      staffId: override.staffId,
      componentId: override.componentId,
      amount: payable,
    });
  }

  if (processInserts.length > 0) {
    await tx.staffSalaryProcessOverride.createMany({ data: processInserts });
  }

  return resolvedForPayroll;
}

function resolveStaffSalaryProcessOverrideAmount(
  override: StaffSalaryOverrideForProcess,
  hasPriorProcessOverride: Set<string>,
  sumByOverrideComponentId: Map<string, Prisma.Decimal>
): Prisma.Decimal | null {
  const amount = new Prisma.Decimal(override.amount);

  if (override.isContinuous) {
    return amount;
  }

  if (override.targetAmount == null || override.targetAmount.equals(0)) {
    if (hasPriorProcessOverride.has(override.id)) {
      return null;
    }
    return amount;
  }

  const target = new Prisma.Decimal(override.targetAmount);
  const appliedTotal = sumByOverrideComponentId.get(override.id) ?? new Prisma.Decimal(0);
  const remaining = target.sub(appliedTotal);
  if (remaining.lte(0)) {
    return null;
  }

  return amount.lte(remaining) ? amount : remaining;
}

function groupStaffSalaryOverridesByStaff(
  rows: Array<{ staffId: string; componentId: string; amount: Prisma.Decimal }>
): Map<string, Map<string, Prisma.Decimal>> {
  const byStaff = new Map<string, Map<string, Prisma.Decimal>>();
  for (const row of rows) {
    let byComponent = byStaff.get(row.staffId);
    if (!byComponent) {
      byComponent = new Map();
      byStaff.set(row.staffId, byComponent);
    }
    const existing = byComponent.get(row.componentId);
    byComponent.set(
      row.componentId,
      existing ? existing.add(row.amount) : new Prisma.Decimal(row.amount)
    );
  }
  return byStaff;
}

function parseFunctionElementIds(value: Prisma.JsonValue | null): string[] {
  if (value == null || !Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function getEffectiveOverrideAmount(
  overridesByComponentId: Map<string, Prisma.Decimal>,
  componentId: string
): Prisma.Decimal | undefined {
  const override = overridesByComponentId.get(componentId);
  if (override == null || override.isZero()) return undefined;
  return new Prisma.Decimal(override);
}

function applyOverridePriority(
  baseAmount: Prisma.Decimal,
  overridesByComponentId: Map<string, Prisma.Decimal>,
  componentId: string
): Prisma.Decimal {
  return getEffectiveOverrideAmount(overridesByComponentId, componentId) ?? baseAmount;
}

function calculateFunctionComponentAmount(
  component: ActiveSalaryComponent,
  resolvedAmounts: Map<string, Prisma.Decimal>
): Prisma.Decimal {
  const elementIds = parseFunctionElementIds(component.functionElements);
  if (elementIds.length === 0 || component.functionPercentage == null) {
    return new Prisma.Decimal(0);
  }

  let elementSum = new Prisma.Decimal(0);
  for (const elementId of elementIds) {
    const elementAmount = resolvedAmounts.get(elementId);
    if (elementAmount != null) {
      elementSum = elementSum.add(elementAmount);
    }
  }

  const percentage = new Prisma.Decimal(component.functionPercentage);
  return elementSum.mul(percentage).div(100);
}

function resolveFunctionComponentAmounts(
  functionComponentIds: string[],
  activeComponentById: Map<string, ActiveSalaryComponent>,
  overridesByComponentId: Map<string, Prisma.Decimal>,
  resolvedAmounts: Map<string, Prisma.Decimal>
): void {
  let pending = [...functionComponentIds];
  let iterations = 0;

  while (pending.length > 0 && iterations <= pending.length) {
    iterations += 1;
    const deferred: string[] = [];

    for (const componentId of pending) {
      const override = getEffectiveOverrideAmount(overridesByComponentId, componentId);
      if (override) {
        resolvedAmounts.set(componentId, override);
        continue;
      }

      const component = activeComponentById.get(componentId);
      if (!component?.isFunction) continue;

      const elementIds = parseFunctionElementIds(component.functionElements);
      const allElementsResolved = elementIds.every((id) => resolvedAmounts.has(id));
      if (!allElementsResolved) {
        deferred.push(componentId);
        continue;
      }

      resolvedAmounts.set(
        componentId,
        calculateFunctionComponentAmount(component, resolvedAmounts)
      );
    }

    if (deferred.length === pending.length) {
      for (const componentId of deferred) {
        const override = getEffectiveOverrideAmount(overridesByComponentId, componentId);
        if (override) {
          resolvedAmounts.set(componentId, override);
          continue;
        }
        const component = activeComponentById.get(componentId);
        if (!component) continue;
        resolvedAmounts.set(
          componentId,
          calculateFunctionComponentAmount(component, resolvedAmounts)
        );
      }
      break;
    }

    pending = deferred;
  }
}

function buildStaffPayrollCharts(
  staff: {
    gradeLevelId: string;
    step: number;
    employmentType: EmploymentType;
  },
  charts: Array<StaffSalaryChartRow & { component: ActiveSalaryComponent }>,
  overridesByComponentId: Map<string, Prisma.Decimal>,
  activeSalaryComponents: ActiveSalaryComponent[]
): StaffPayrollChartRow[] {
  const activeComponentById = new Map(
    activeSalaryComponents.map((component) => [component.id, component])
  );
  const chartByComponentId = new Map(charts.map((chart) => [chart.componentId, chart]));

  const componentIds = new Set<string>();
  for (const chart of charts) componentIds.add(chart.componentId);
  for (const componentId of overridesByComponentId.keys()) componentIds.add(componentId);
  for (const component of activeSalaryComponents) {
    if (component.isFunction) componentIds.add(component.id);
  }

  const sortedComponents = sortActiveSalaryComponents(
    [...componentIds]
      .map((componentId) => activeComponentById.get(componentId))
      .filter((component): component is ActiveSalaryComponent => component != null)
  );

  const nonFunctionIds = sortedComponents
    .filter((component) => !component.isFunction)
    .map((component) => component.id);
  const functionIds = sortedComponents
    .filter((component) => component.isFunction)
    .map((component) => component.id);

  const resolvedAmounts = new Map<string, Prisma.Decimal>();

  for (const componentId of nonFunctionIds) {
    const chart = chartByComponentId.get(componentId);
    const baseAmount = chart ? new Prisma.Decimal(chart.amount) : new Prisma.Decimal(0);
    resolvedAmounts.set(
      componentId,
      applyOverridePriority(baseAmount, overridesByComponentId, componentId)
    );
  }

  resolveFunctionComponentAmounts(
    functionIds,
    activeComponentById,
    overridesByComponentId,
    resolvedAmounts
  );

  for (const componentId of functionIds) {
    if (resolvedAmounts.has(componentId)) continue;
    const override = getEffectiveOverrideAmount(overridesByComponentId, componentId);
    if (override) {
      resolvedAmounts.set(componentId, override);
      continue;
    }
    const component = activeComponentById.get(componentId);
    if (component) {
      resolvedAmounts.set(
        componentId,
        calculateFunctionComponentAmount(component, resolvedAmounts)
      );
    }
  }

  for (const componentId of functionIds) {
    if (!resolvedAmounts.has(componentId)) {
      resolvedAmounts.set(componentId, new Prisma.Decimal(0));
    }
  }

  const rows: StaffPayrollChartRow[] = [];
  for (const component of sortedComponents) {
    let amount = resolvedAmounts.get(component.id) ?? new Prisma.Decimal(0);

    rows.push({
      gradeLevelId: staff.gradeLevelId,
      step: staff.step,
      employmentType: staff.employmentType,
      componentId: component.id,
      component,
      amount,
    });
  }
  const sortedRows = sortPayrollChartRows(rows);
  sortedRows.forEach((row) => {
    if (
      row.component.id === "comp0001-0000-4000-8000-000000000008" &&
      row.component.isFunction &&
      row.component.functionPercentage?.toString() === "100"
    ) {
      row.amount = new Prisma.Decimal(
        calculateAnnualProgressiveTax(Number(row.amount), sortedRows)
      );
    }
  });

  return sortedRows;
}

function computePayrollTotals(charts: StaffPayrollChartRow[]): {
  netEarnings: number;
  netGross: number;
  netDeductions: number;
  netAllowances: number;
  netPay: number;
} {
  const netGross = charts
    .filter(
      (chart) => chart.component.type === SalaryComponentType.EARNING && chart.component.isStatutory
    )
    .reduce((acc, chart) => acc + Number(chart.amount), 0);
  const netEarnings = charts
    .filter((chart) => chart.component.type === SalaryComponentType.EARNING)
    .reduce((acc, chart) => acc + Number(chart.amount), 0);
  const netDeductions = charts
    .filter((chart) => chart.component.type === SalaryComponentType.DEDUCTION)
    .reduce((acc, chart) => acc + Number(chart.amount), 0);
  const netAllowances = charts
    .filter(
      (chart) =>
        chart.component.type === SalaryComponentType.EARNING && !chart.component.isStatutory
    )
    .reduce((acc, chart) => acc + Number(chart.amount), 0);
  return {
    netEarnings,
    netGross,
    netDeductions,
    netAllowances,
    netPay: netEarnings - netDeductions,
  };
}

const payrollReportComponentSelect = {
  id: true,
  name: true,
  shortName: true,
  type: true,
  rank: true,
  status: true,
  isTaxable: true,
  isPensionable: true,
  isStatutory: true,
  isFunction: true,
  accountId: true,
} satisfies Prisma.SalaryComponentSelect;

export type PayrollReportPeriodComponent = Prisma.SalaryComponentGetPayload<{
  select: typeof payrollReportComponentSelect;
}>;

const payrollComponentAccountSelect = {
  id: true,
  name: true,
  shortName: true,
  accountId: true,
} satisfies Prisma.SalaryComponentSelect;

function formatSalaryComponentLabel(component: { name: string; shortName: string | null }): string {
  const shortName = component.shortName?.trim();
  return shortName && shortName.length > 0 ? shortName : component.name;
}

async function assertPayrollSalaryComponentsHaveValidAccounts(
  db: Prisma.TransactionClient | typeof prisma,
  componentIds: string[]
): Promise<void> {
  const uniqueComponentIds = [...new Set(componentIds)];
  if (uniqueComponentIds.length === 0) return;

  const components = await db.salaryComponent.findMany({
    where: { id: { in: uniqueComponentIds } },
    select: payrollComponentAccountSelect,
  });

  const componentById = new Map(components.map((component) => [component.id, component]));
  const accountIds = [
    ...new Set(
      components
        .map((component) => component.accountId)
        .filter((id): id is number => id != null && Number.isInteger(id) && id > 0)
    ),
  ];

  const activeAccountIds = new Set(
    accountIds.length > 0
      ? (
          await db.accountChart.findMany({
            where: { id: { in: accountIds }, status: Status.Active },
            select: { id: true },
          })
        ).map((account) => account.id)
      : []
  );

  const invalidLabels: string[] = [];
  for (const componentId of uniqueComponentIds) {
    const component = componentById.get(componentId);
    if (!component) {
      invalidLabels.push(componentId);
      continue;
    }
    if (component.accountId == null || !activeAccountIds.has(component.accountId)) {
      invalidLabels.push(formatSalaryComponentLabel(component));
    }
  }

  if (invalidLabels.length === 0) return;

  if (invalidLabels.length === 1) {
    throw new Error(
      `${invalidLabels[0]} does not have a valid account number please contact the administrator`
    );
  }

  throw new Error(
    `${invalidLabels.join(", ")} do not have valid account numbers please contact the administrator`
  );
}

export interface PayrollReportPayrollComponentRow {
  id: string;
  payrollProcessId: string;
  componentId: string;
  amount: string;
}

export interface PayrollReportStaffPayrollRow {
  id: string;
  staffId: string;
  year: number;
  month: number;
  gradeLevelId: string;
  step: number;
  employmentType: EmploymentType;
  grossEarnings: string;
  netAllowances: string;
  netEarnings: string;
  netDeductions: string;
  netPay: string;
  isApproved: boolean;
  isPosted: boolean;
  approvedAt: Date | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  staff: { id: string; StaffNumber: string; name: string };
  gradeLevel: { id: string; name: string };
  payrollComponents: PayrollReportPayrollComponentRow[];
}

export interface PayrollReportResult {
  periodComponent: PayrollReportPeriodComponent[];
  staffPayroll: PayrollReportStaffPayrollRow[];
}

function sortSalaryComponentsForReport(
  components: PayrollReportPeriodComponent[]
): PayrollReportPeriodComponent[] {
  return [...components].sort(compareSalaryComponentsByTypeAndRank);
}

function sortPayrollComponentsForReport<
  T extends { component: { type: SalaryComponentType; rank: number; name: string } },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareSalaryComponentsByTypeAndRank(a.component, b.component));
}

function mapPayrollReportComponentRow(row: {
  id: string;
  payrollProcessId: string;
  componentId: string;
  amount: { toString(): string };
}): PayrollReportPayrollComponentRow {
  return {
    id: row.id,
    payrollProcessId: row.payrollProcessId,
    componentId: row.componentId,
    amount: row.amount.toString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateReportYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("year must be an integer between 1900 and 2100");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month must be an integer between 1 and 12");
  }
}

function normalizePayrollProcessIds(ids: unknown): string[] | undefined {
  if (ids === undefined) return undefined;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids must be a non-empty array when provided");
  }
  const unique = [...new Set(ids.map((id) => (typeof id === "string" ? id.trim() : "")))];
  if (unique.some((id) => !UUID_RE.test(id))) {
    throw new Error("ids must contain valid UUID payroll process ids");
  }
  return unique;
}

function payrollProcessPeriodWhere(
  year: number,
  month: number,
  ids?: string[]
): Prisma.PayrollProcessWhereInput {
  return {
    year,
    month,
    ...(ids ? { id: { in: ids } } : {}),
  };
}

async function assertPayrollProcessesMatchPeriod(
  year: number,
  month: number,
  ids: string[]
): Promise<void> {
  const count = await prisma.payrollProcess.count({
    where: payrollProcessPeriodWhere(year, month, ids),
  });
  if (count !== ids.length) {
    throw new Error("One or more payroll process ids are invalid for the given year and month");
  }
}

export interface PayrollPeriodActionInput {
  year: number;
  month: number;
  actedBy: string;
  ids?: string[];
}

export interface PayrollApprovalInput extends PayrollPeriodActionInput {
  approved: boolean;
}

function calculateAnnualProgressiveTax(income: number, charts: StaffPayrollChartRow[]): number {
  const nonTaxableDeductions = charts
    .filter(
      (chart) =>
        chart.component.type === SalaryComponentType.DEDUCTION &&
        !chart.component.isTaxable &&
        chart.component.id !== "comp0001-0000-4000-8000-000000000008"
    )
    .reduce((acc, chart) => acc + Number(chart.amount), 0);

  const taxableIncome = Math.max(0, income - nonTaxableDeductions);

  return calculateAnnualProgressiveTaxActualIncome(taxableIncome);
}

function calculateAnnualProgressiveTaxActualIncome(actualTaxableIncome: number): number {
  if (actualTaxableIncome <= 0) return 0;
  let tax = 0;

  let remainingIncome = actualTaxableIncome * 12;

  const brackets: [number, number][] = [
    [800000, 0.0],
    [2200000, 0.15],
    [9000000, 0.18],
    [13000000, 0.21],
    [25000000, 0.23],
    [Number.MAX_VALUE, 0.25],
  ];

  for (const [limit, rate] of brackets) {
    if (remainingIncome <= 0) break;

    const taxable = Math.min(remainingIncome, limit);

    tax += taxable * rate;

    remainingIncome -= taxable;
  }
  tax = tax / 12;
  return Number(tax.toFixed(2));
}
export class PayrollService {
  async getPayrollReport(params: {
    year: number;
    month: number;
    staffId?: string;
  }): Promise<PayrollReportResult> {
    validateReportYearMonth(params.year, params.month);

    if (params.staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: params.staffId },
        select: { id: true },
      });
      if (!staff) throw new Error("Invalid staffId");
    }

    const periodPayrollComponents = await prisma.payrollComponent.findMany({
      where: {
        year: params.year,
        month: params.month,
      },
      select: { componentId: true },
      distinct: ["componentId"],
    });

    const uniqueComponentIds = periodPayrollComponents.map((r) => r.componentId);

    const periodComponentRows =
      uniqueComponentIds.length > 0
        ? await prisma.salaryComponent.findMany({
            where: { id: { in: uniqueComponentIds } },
            select: payrollReportComponentSelect,
          })
        : [];

    const periodComponent = sortSalaryComponentsForReport(periodComponentRows);

    const payrollProcesses = await prisma.payrollProcess.findMany({
      where: {
        year: params.year,
        month: params.month,
        ...(params.staffId ? { staffId: params.staffId } : {}),
      },
      include: {
        staff: { select: { id: true, StaffNumber: true, name: true } },
        gradeLevel: { select: { id: true, name: true } },
        payrollComponents: {
          where: { year: params.year, month: params.month },
          include: {
            component: { select: payrollReportComponentSelect },
          },
          orderBy: [{ component: { type: "asc" } }, { component: { rank: "asc" } }],
        },
      },
      orderBy: [{ staff: { name: "asc" } }],
    });

    const staffPayroll: PayrollReportStaffPayrollRow[] = payrollProcesses.map((process) => ({
      id: process.id,
      staffId: process.staffId,
      year: process.year,
      month: process.month,
      gradeLevelId: process.gradeLevelId,
      step: process.step,
      employmentType: process.employmentType,
      grossEarnings: process.grossEarnings.toString(),
      netAllowances: process.netAllowances.toString(),
      netEarnings: process.netEarnings.toString(),
      netDeductions: process.netDeductions.toString(),
      netPay: process.netPay.toString(),
      isApproved: process.isApproved,
      isPosted: process.isPosted,
      approvedAt: process.approvedAt,
      postedAt: process.postedAt,
      createdAt: process.createdAt,
      updatedAt: process.updatedAt,
      staff: process.staff,
      gradeLevel: process.gradeLevel,
      payrollComponents: sortPayrollComponentsForReport(process.payrollComponents).map(
        mapPayrollReportComponentRow
      ),
    }));

    return { periodComponent, staffPayroll };
  }

  async setApproval(input: PayrollApprovalInput): Promise<{ count: number; approved: boolean }> {
    validateReportYearMonth(input.year, input.month);
    const actedBy = input.actedBy?.trim();
    if (!actedBy) throw new Error("actedBy is required");

    const ids = normalizePayrollProcessIds(input.ids);
    if (ids) await assertPayrollProcessesMatchPeriod(input.year, input.month, ids);

    const where = payrollProcessPeriodWhere(input.year, input.month, ids);

    if (!input.approved) {
      const postedCount = await prisma.payrollProcess.count({
        where: { ...where, isPosted: true },
      });
      if (postedCount > 0) {
        throw new Error("Posted payroll records cannot be unapproved");
      }
    }

    const now = new Date();
    const processData: Prisma.PayrollProcessUncheckedUpdateManyInput = input.approved
      ? {
          isApproved: true,
          approvedBy: actedBy,
          approvedAt: now,
        }
      : {
          isApproved: false,
          approvedBy: null,
          approvedAt: null,
        };

    const componentData: Prisma.PayrollComponentUncheckedUpdateManyInput = input.approved
      ? { isApproved: true }
      : { isApproved: false };

    return prisma.$transaction(async (tx) => {
      const processes = await tx.payrollProcess.findMany({
        where,
        select: { id: true },
      });
      if (processes.length === 0) {
        return { count: 0, approved: input.approved };
      }

      const processIds = processes.map((p) => p.id);

      const processResult = await tx.payrollProcess.updateMany({
        where: { id: { in: processIds } },
        data: processData,
      });

      await tx.payrollComponent.updateMany({
        where: {
          payrollProcessId: { in: processIds },
          year: input.year,
          month: input.month,
        },
        data: componentData,
      });

      return { count: processResult.count, approved: input.approved };
    });
  }

  async postPayroll(input: PayrollPeriodActionInput): Promise<{ count: number }> {
    validateReportYearMonth(input.year, input.month);
    const actedBy = input.actedBy?.trim();
    if (!actedBy) throw new Error("actedBy is required");

    const ids = normalizePayrollProcessIds(input.ids);
    if (ids) await assertPayrollProcessesMatchPeriod(input.year, input.month, ids);

    const where = payrollProcessPeriodWhere(input.year, input.month, ids);

    const notApprovedCount = await prisma.payrollProcess.count({
      where: { ...where, isApproved: false },
    });
    if (notApprovedCount > 0) {
      throw new Error("Only approved payroll records can be posted");
    }

    const processesToPost = await prisma.payrollProcess.findMany({
      where: { ...where, isApproved: true, isPosted: false },
      select: { id: true },
    });
    if (processesToPost.length === 0) {
      return { count: 0 };
    }

    const processIdsToPost = processesToPost.map((process) => process.id);
    const payrollComponentRows = await prisma.payrollComponent.findMany({
      where: {
        payrollProcessId: { in: processIdsToPost },
        year: input.year,
        month: input.month,
        isPosted: false,
      },
      select: { componentId: true },
      distinct: ["componentId"],
    });

    await assertPayrollSalaryComponentsHaveValidAccounts(
      prisma,
      payrollComponentRows.map((row) => row.componentId)
    );

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const toPost = await tx.payrollProcess.findMany({
        where: { ...where, isPosted: false },
        select: { id: true },
      });
      if (toPost.length === 0) {
        return { count: 0 };
      }

      const processIds = toPost.map((p) => p.id);

      const result = await tx.payrollProcess.updateMany({
        where: { id: { in: processIds }, isPosted: false },
        data: {
          isPosted: true,
          postedBy: actedBy,
          postedAt: now,
        },
      });

      await tx.payrollComponent.updateMany({
        where: {
          payrollProcessId: { in: processIds },
          year: input.year,
          month: input.month,
          isPosted: false,
        },
        data: { isPosted: true },
      });
      const sumByComponentId = await tx.payrollComponent.groupBy({
        by: ["componentId"],
        _sum: { amount: true },
        where: {
          payrollProcessId: { in: processIds },
          year: input.year,
          month: input.month,
          isPosted: true,
        },
      });

      const componentIds = sumByComponentId.map((row) => row.componentId);
      const components =
        componentIds.length > 0
          ? await tx.salaryComponent.findMany({
              where: { id: { in: componentIds } },
              select: salaryComponentSelectForPosting,
            })
          : [];
      const componentById = new Map(components.map((component) => [component.id, component]));

      const sumOfComponents = sumByComponentId.map((row) => ({
        componentId: row.componentId,
        amount: row._sum.amount ?? new Prisma.Decimal(0),
        component: componentById.get(row.componentId)!,
      }));

      const postedPayrollLines = await tx.payrollComponent.findMany({
        where: {
          payrollProcessId: { in: processIds },
          year: input.year,
          month: input.month,
          isPosted: true,
        },
        select: {
          componentId: true,
          amount: true,
          payrollProcess: {
            select: {
              staffId: true,
              staff: { select: { id: true, name: true, StaffNumber: true } },
            },
          },
        },
      });

      const payrollLinesByComponentId = new Map<
        string,
        Array<(typeof postedPayrollLines)[number]>
      >();
      for (const line of postedPayrollLines) {
        const list = payrollLinesByComponentId.get(line.componentId) ?? [];
        list.push(line);
        payrollLinesByComponentId.set(line.componentId, list);
      }

      const salaryPayableSetting = await defaultAccountSettingsService.getAccountChartBySettingsId(
        "STAFF_SALARY_PAYABLE_ACCOUNT",
        tx
      );
      const staffAccountSetting = await defaultAccountSettingsService.getAccountChartBySettingsId(
        "STAFF_ACCOUNT",
        tx
      );
      const payrollRefBase = `PAYROLL-${input.year}-${input.month}`;

      for (const component of sumOfComponents) {
        if (component.component.type === SalaryComponentType.EARNING) {
          await accountTransactionService.debitAccount(
            {
              accountId: String(component.component.accountId),
              amount: Number(component.amount),
              ref: `PAYROLL-${now.toISOString()}`,
              manualRef: `PAYROLL-${now.toISOString()}`,
              transactionDate: now.toISOString(),
              postedBy: actedBy,
              remarks: `Payroll for ${component.component.name}`,
            },
            tx
          );
          await accountTransactionService.creditAccount(
            {
              accountId: String(salaryPayableSetting.accountId),
              amount: Number(component.amount),
              ref: `PAYROLL-${now.toISOString()}`,
              manualRef: `PAYROLL-${now.toISOString()}`,
              transactionDate: now.toISOString(),
              postedBy: actedBy,
              remarks: `Payroll for ${component.component.name}`,
            },
            tx
          );
        } else {
          await accountTransactionService.debitAccount(
            {
              accountId: String(salaryPayableSetting.accountId),
              amount: Number(component.amount),
              ref: `PAYROLL-${now.toISOString()}`,
              manualRef: `PAYROLL-${now.toISOString()}`,
              transactionDate: now.toISOString(),
              postedBy: actedBy,
              remarks: `Payroll for ${component.component.name}`,
            },
            tx
          );
          if (component.component.account?.group?.id === 1) {
            const staffPayrollLines = payrollLinesByComponentId.get(component.componentId) ?? [];
            for (const line of staffPayrollLines) {
              const amount = Number(line.amount);
              if (!Number.isFinite(amount) || amount <= 0) continue;

              await accountTransactionService.creditAccount(
                {
                  accountId: String(staffAccountSetting.accountId),
                  amount,
                  ref: payrollRefBase,
                  manualRef: `${payrollRefBase}-${component.componentId}-${line.payrollProcess.staffId}`,
                  transactionDate: now.toISOString(),
                  postedBy: actedBy,
                  accountSub: line.payrollProcess.staffId,
                  remarks: `Payroll ${component.component.name} - ${line.payrollProcess.staff.name}`,
                },
                tx
              );
            }
          } else {
            await accountTransactionService.creditAccount(
              {
                accountId: String(component.component.accountId),
                amount: Number(component.amount),
                ref: `PAYROLL-${now.toISOString()}`,
                manualRef: `PAYROLL-${now.toISOString()}`,
                transactionDate: now.toISOString(),
                postedBy: actedBy,
                remarks: `Payroll for ${component.component.name}`,
              },
              tx
            );
          }
        }
      }
      return { count: result.count };
    });
  }

  async compute(): Promise<{ success: boolean; message: string }> {
    try {
      const activePayrollPeriod = await activePayrollPeriodService.getActivePayrollPeriod();
      if (!activePayrollPeriod) {
        return { success: false, message: "Active payroll period not found" };
      }

      const activeStaffs = await prisma.staff.findMany({
        where: { status: Status.Active },
        select: {
          id: true,
          StaffNumber: true,
          name: true,
          employmentType: true,
          gradeLevelId: true,
          step: true,
          gradeLevel: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const salaryChartRows = await prisma.salaryChart.findMany({
        where: { status: Status.Active },
        select: staffSalaryChartSelect,
      });

      const chartsBySlot = groupSalaryChartsBySlot(salaryChartRows);
      const activeSalaryComponents = sortActiveSalaryComponents(
        await prisma.salaryComponent.findMany({
          where: { status: Status.Active },
          select: salaryComponentSelect,
        })
      );
      // console.log("activeSalaryComponents", activeSalaryComponents);
      const { year, month } = activePayrollPeriod;

      const staffEligibleForPayroll = activeStaffs.filter(
        (staff): staff is (typeof activeStaffs)[number] & { gradeLevelId: string } =>
          Boolean(staff.gradeLevelId)
      );

      await prisma.$transaction(
        async (tx) => {
          const postedInPeriod = await tx.payrollProcess.count({
            where: { year, month, isPosted: true },
          });
          if (postedInPeriod > 0) {
            throw new Error("Cannot recompute payroll for a period that contains posted records");
          }

          await tx.payrollComponent.deleteMany({ where: { year, month } });
          await tx.payrollProcess.deleteMany({ where: { year, month } });
          await tx.staffSalaryProcessOverride.deleteMany({ where: { year, month } });

          const staffIds = staffEligibleForPayroll.map((staff) => staff.id);
          const overrideComponents =
            staffIds.length > 0
              ? await tx.staffSalaryOverrideComponent.findMany({
                  where: { staffId: { in: staffIds }, status: Status.Active },
                  select: staffSalaryOverrideForProcessSelect,
                })
              : [];

          const resolvedOverrideRows = await resolveAndPersistStaffSalaryProcessOverrides(
            tx,
            overrideComponents,
            year,
            month
          );
          const overridesByStaffId = groupStaffSalaryOverridesByStaff(resolvedOverrideRows);

          for (const staff of staffEligibleForPayroll) {
            const salaryCharts = mapSalaryChartsForStaff(
              staff,
              chartsBySlot,
              activeSalaryComponents
            );
            const staffOverrides = overridesByStaffId.get(staff.id) ?? new Map();
            if (salaryCharts.length === 0 && staffOverrides.size === 0) {
              continue;
            }

            const chartsWithAmounts = buildStaffPayrollCharts(
              {
                gradeLevelId: staff.gradeLevelId,
                step: staff.step,
                employmentType: staff.employmentType,
              },
              salaryCharts,
              staffOverrides,
              activeSalaryComponents
            );
            // console.log("chartsWithAmounts", chartsWithAmounts);
            const { netEarnings, netGross, netDeductions, netAllowances, netPay } =
              computePayrollTotals(chartsWithAmounts);

            const payrollProcess = await tx.payrollProcess.create({
              data: {
                staffId: staff.id,
                year,
                month,
                gradeLevelId: staff.gradeLevelId,
                step: staff.step,
                employmentType: staff.employmentType,
                grossEarnings: netGross,
                netAllowances,
                netEarnings,
                netDeductions,
                netPay,
              },
            });

            await tx.payrollComponent.createMany({
              data: chartsWithAmounts.map((chart) => ({
                payrollProcessId: payrollProcess.id,
                month,
                year,
                componentId: chart.componentId,
                amount: chart.amount,
              })),
            });
          }
        },
        { maxWait: 10_000, timeout: 120_000 }
      );

      return { success: true, message: "Payroll computation completed successfully" };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("posted records")) {
        return { success: false, message: error.message };
      }
      console.error("Payroll computation failed", error);
      return { success: false, message: "Failed to compute payroll" };
    }
  }
}

export const payrollService = new PayrollService();
