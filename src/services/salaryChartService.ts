import prisma from "../utils/prisma";
import { EmploymentType, Prisma, Status } from "@prisma/client";

const salaryChartInclude = {
  gradeLevel: { select: { id: true, name: true, status: true } },
  component: {
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      shortName: true,
      rank: true,
      isTaxable: true,
      isPensionable: true,
      isStatutory: true,
      isFunction: true,
    },
  },
} satisfies Prisma.SalaryChartInclude;

export interface SalaryChartComponentInput {
  componentId: string;
  amount: string | number;
}

export interface SalaryChartData {
  id: string;
  gradeLevelId: string;
  step: number;
  employmentType: EmploymentType;
  componentId: string;
  amount: string;
  status: Status;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  gradeLevel: SalaryChartGradeLevelDetail;
  component: SalaryChartComponentDetail;
}

export interface SalaryChartComponentDetail {
  id: string;
  name: string;
  type: string;
  status: Status;
  shortName?: string | null;
  rank?: number;
  isTaxable?: boolean;
  isPensionable?: boolean;
  isStatutory?: boolean;
  isFunction?: boolean;
}

export interface SalaryChartGroupedComponent {
  componentId: string;
  amount: string;
  component: SalaryChartComponentDetail;
}

export interface SalaryChartGradeLevelDetail {
  id: string;
  name: string;
  status: Status;
}

export interface SalaryChartGrouped {
  gradeLevelId: string;
  gradeLevel: SalaryChartGradeLevelDetail;
  step: number;
  employmentType: EmploymentType;
  components: SalaryChartGroupedComponent[];
}

export interface ListSalaryChartsParams {
  gradeLevelId?: string;
  step?: number;
  employmentType?: EmploymentType;
  status?: Status | "All";
}

type SalaryChartRow = Prisma.SalaryChartGetPayload<{ include: typeof salaryChartInclude }>;

function groupKey(row: {
  gradeLevelId: string;
  step: number;
  employmentType: EmploymentType;
}): string {
  return `${row.gradeLevelId}|${row.step}|${row.employmentType}`;
}

function groupRows(rows: SalaryChartRow[]): SalaryChartGrouped[] {
  const map = new Map<string, SalaryChartGrouped>();

  for (const row of rows) {
    const key = groupKey(row);
    let group = map.get(key);
    if (!group) {
      group = {
        gradeLevelId: row.gradeLevelId,
        gradeLevel: row.gradeLevel,
        step: row.step,
        employmentType: row.employmentType,
        components: [],
      };
      map.set(key, group);
    }
    group.components.push({
      componentId: row.componentId,
      amount: row.amount.toString(),
      component: {
        id: row.component.id,
        name: row.component.name,
        type: row.component.type,
        status: row.component.status,
        shortName: row.component.shortName ?? null,
        rank: row.component.rank,
        isTaxable: row.component.isTaxable,
        isPensionable: row.component.isPensionable ?? false,
        isStatutory: row.component.isStatutory ?? false,
        isFunction: row.component.isFunction ?? false,
      },
    });
  }

  const groups = [...map.values()];
  for (const group of groups) {
    group.components.sort((a, b) => a.component.name.localeCompare(b.component.name));
  }

  groups.sort((a, b) => {
    const byGrade = a.gradeLevel.name.localeCompare(b.gradeLevel.name);
    if (byGrade !== 0) return byGrade;
    if (a.step !== b.step) return a.step - b.step;
    return a.employmentType.localeCompare(b.employmentType);
  });

  return groups;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  );
}

function mapRow(row: SalaryChartRow): SalaryChartData {
  return {
    id: row.id,
    gradeLevelId: row.gradeLevelId,
    step: row.step,
    employmentType: row.employmentType,
    componentId: row.componentId,
    amount: row.amount.toString(),
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    gradeLevel: row.gradeLevel,
    component: {
      id: row.component.id,
      name: row.component.name,
      type: row.component.type,
      status: row.component.status,
      shortName: row.component.shortName ?? null,
      rank: row.component.rank ?? null,
      isTaxable: row.component.isTaxable,
      isPensionable: row.component.isPensionable ?? false,
      isStatutory: row.component.isStatutory ?? false,
      isFunction: row.component.isFunction ?? false,
    },
  };
}

function parseAmount(value: string | number): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error("amount must be zero or greater");
  }
  return d;
}

export class SalaryChartService {
  private prisma = prisma;

  private async assertGradeLevelExists(gradeLevelId: string): Promise<void> {
    const row = await this.prisma.gradeLevel.findUnique({
      where: { id: gradeLevelId },
      select: { id: true },
    });
    if (!row) throw new Error("Invalid gradeLevelId: grade level not found");
  }

  private async assertComponentsExist(componentIds: string[]): Promise<void> {
    if (!componentIds.length) return;

    const rows = await this.prisma.salaryComponent.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, status: true },
    });
    if (rows.length !== componentIds.length) {
      throw new Error("One or more componentId values are invalid");
    }
    const inactive = rows.find((r) => r.status !== Status.Active);
    if (inactive) {
      throw new Error("All salary components must be Active");
    }
  }

  async upsertChart(input: {
    gradeLevelId: string;
    step: number;
    employmentType: EmploymentType;
    components: SalaryChartComponentInput[];
    userId: string;
  }): Promise<SalaryChartGrouped> {
    const gradeLevelId = input.gradeLevelId.trim();
    if (!gradeLevelId) throw new Error("gradeLevelId is required");

    if (!Number.isInteger(input.step) || input.step < 1) {
      throw new Error("step must be a positive integer");
    }

    if (!input.components.length) {
      throw new Error("components must not be empty");
    }

    const seen = new Set<string>();
    for (const item of input.components) {
      const componentId = item.componentId?.trim();
      if (!componentId) throw new Error("Each component must have a componentId");
      if (seen.has(componentId)) {
        throw new Error(`Duplicate componentId in components: ${componentId}`);
      }
      seen.add(componentId);
    }

    const componentIds = [...seen];
    await this.assertGradeLevelExists(gradeLevelId);
    await this.assertComponentsExist(componentIds);

    const parsedComponents = input.components.map((item) => ({
      componentId: item.componentId.trim(),
      amount: parseAmount(item.amount),
    }));

    try {
      const charts = await this.prisma.$transaction(async (tx) => {
        await tx.salaryChart.deleteMany({
          where: {
            gradeLevelId,
            step: input.step,
            employmentType: input.employmentType,
            componentId: { notIn: componentIds },
          },
        });

        for (const item of parsedComponents) {
          await tx.salaryChart.upsert({
            where: {
              gradeLevelId_step_employmentType_componentId: {
                gradeLevelId,
                step: input.step,
                employmentType: input.employmentType,
                componentId: item.componentId,
              },
            },
            create: {
              gradeLevelId,
              step: input.step,
              employmentType: input.employmentType,
              componentId: item.componentId,
              amount: item.amount,
              createdBy: input.userId,
              updatedBy: input.userId,
            },
            update: {
              amount: item.amount,
              updatedBy: input.userId,
              status: Status.Active,
            },
          });
        }

        return tx.salaryChart.findMany({
          where: {
            gradeLevelId,
            step: input.step,
            employmentType: input.employmentType,
          },
          include: salaryChartInclude,
          orderBy: [{ component: { name: "asc" } }],
        });
      });

      const grouped = groupRows(charts);
      const chart = grouped[0];
      if (!chart) {
        throw new Error("Salary chart upsert failed");
      }
      return chart;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Invalid reference: grade level or salary component not found");
      }
      throw e;
    }
  }

  async listGrouped(params: ListSalaryChartsParams = {}): Promise<{
    salaryCharts: SalaryChartGrouped[];
    count: number;
  }> {
    const where: Prisma.SalaryChartWhereInput = {};
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.gradeLevelId?.trim()) where.gradeLevelId = params.gradeLevelId.trim();
    if (params.step !== undefined) where.step = params.step;
    if (params.employmentType !== undefined) where.employmentType = params.employmentType;

    const rows = await this.prisma.salaryChart.findMany({
      where,
      include: salaryChartInclude,
      orderBy: [
        { gradeLevel: { name: "asc" } },
        { step: "asc" },
        { employmentType: "asc" },
        { component: { name: "asc" } },
      ],
    });

    const salaryCharts = groupRows(rows);
    return { salaryCharts, count: salaryCharts.length };
  }

  async getGroupedById(id: string): Promise<SalaryChartGrouped | null> {
    const anchor = await this.prisma.salaryChart.findUnique({
      where: { id },
      select: { id: true, gradeLevelId: true, step: true, employmentType: true },
    });
    if (!anchor) return null;

    const rows = await this.prisma.salaryChart.findMany({
      where: {
        gradeLevelId: anchor.gradeLevelId,
        step: anchor.step,
        employmentType: anchor.employmentType,
      },
      include: salaryChartInclude,
      orderBy: [{ component: { name: "asc" } }],
    });

    return groupRows(rows)[0] ?? null;
  }
}

export const salaryChartService = new SalaryChartService();
