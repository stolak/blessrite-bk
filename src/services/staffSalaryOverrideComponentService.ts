import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

const overrideInclude = {
  staff: { select: { id: true, name: true, StaffNumber: true, status: true } },
  component: {
    select: {
      id: true,
      name: true,
      shortName: true,
      type: true,
      status: true,
      rank: true,
      isTaxable: true,
      isPensionable: true,
      isStatutory: true,
      isFunction: true,
      accountId: true,
    },
  },
} satisfies Prisma.StaffSalaryOverrideComponentInclude;

type OverrideRow = Prisma.StaffSalaryOverrideComponentGetPayload<{ include: typeof overrideInclude }>;

export interface StaffSalaryOverrideComponentData {
  id: string;
  staffId: string;
  componentId: string;
  amount: string;
  isContinuous: boolean;
  targetAmount: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: Status;
  staff: OverrideRow["staff"];
  component: OverrideRow["component"];
}

export interface ListStaffSalaryOverrideComponentsParams {
  staffId?: string;
  componentId?: string;
  status?: Status | "All";
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: string }).code === "string";
}

function parseDecimalNonNegative(value: string | number): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error("amount must be zero or greater");
  }
  return d;
}

function parseTargetDecimalNonNegative(value: string | number | null | undefined): Prisma.Decimal | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error("targetAmount must be zero or greater");
  }
  return d;
}

function mapRow(row: OverrideRow): StaffSalaryOverrideComponentData {
  return {
    id: row.id,
    staffId: row.staffId,
    componentId: row.componentId,
    amount: row.amount.toString(),
    isContinuous: row.isContinuous,
    targetAmount: row.targetAmount?.toString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    staff: row.staff,
    component: row.component,
  };
}

export class StaffSalaryOverrideComponentService {
  private prisma = prisma;

  private async assertStaffExists(staffId: string): Promise<void> {
    const row = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!row) throw new Error("Invalid staffId");
  }

  private async assertSalaryComponentExists(componentId: string): Promise<void> {
    const row = await this.prisma.salaryComponent.findUnique({
      where: { id: componentId },
      select: { id: true },
    });
    if (!row) throw new Error("Invalid componentId");
  }

  async create(input: {
    staffId: string;
    componentId: string;
    amount: string | number;
    isContinuous?: boolean;
    targetAmount?: string | number | null;
    status?: Status;
    createdBy?: string | null;
  }): Promise<StaffSalaryOverrideComponentData> {
    await this.assertStaffExists(input.staffId);
    await this.assertSalaryComponentExists(input.componentId);

    const row = await this.prisma.staffSalaryOverrideComponent.create({
      data: {
        staffId: input.staffId,
        componentId: input.componentId,
        amount: parseDecimalNonNegative(input.amount),
        ...(input.isContinuous !== undefined ? { isContinuous: input.isContinuous } : {}),
        ...(input.targetAmount !== undefined ? { targetAmount: parseTargetDecimalNonNegative(input.targetAmount) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
      },
      include: overrideInclude,
    });

    return mapRow(row);
  }

  async list(params: ListStaffSalaryOverrideComponentsParams = {}): Promise<{
    overrides: StaffSalaryOverrideComponentData[];
    count: number;
  }> {
    const where: Prisma.StaffSalaryOverrideComponentWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.staffId?.trim()) where.staffId = params.staffId.trim();
    if (params.componentId?.trim()) where.componentId = params.componentId.trim();

    const rows = await this.prisma.staffSalaryOverrideComponent.findMany({
      where,
      include: overrideInclude,
      orderBy: [{ createdAt: "desc" }],
    });

    return { overrides: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<StaffSalaryOverrideComponentData | null> {
    const row = await this.prisma.staffSalaryOverrideComponent.findUnique({
      where: { id },
      include: overrideInclude,
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      staffId?: string;
      componentId?: string;
      amount?: string | number;
      isContinuous?: boolean;
      targetAmount?: string | number | null;
      status?: Status;
      updatedBy?: string | null;
    }
  ): Promise<StaffSalaryOverrideComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Staff salary override component not found");

    if (input.staffId !== undefined) await this.assertStaffExists(input.staffId);
    if (input.componentId !== undefined) await this.assertSalaryComponentExists(input.componentId);

    try {
      const row = await this.prisma.staffSalaryOverrideComponent.update({
        where: { id },
        data: {
          ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
          ...(input.componentId !== undefined ? { componentId: input.componentId } : {}),
          ...(input.amount !== undefined ? { amount: parseDecimalNonNegative(input.amount) } : {}),
          ...(input.isContinuous !== undefined ? { isContinuous: input.isContinuous } : {}),
          ...(input.targetAmount !== undefined
            ? { targetAmount: parseTargetDecimalNonNegative(input.targetAmount) ?? null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          // Model does not have updatedBy, so we can't store it. Kept for API parity.
        },
        include: overrideInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Staff salary override component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StaffSalaryOverrideComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Staff salary override component not found");

    const processCount = await this.prisma.staffSalaryProcessOverride.count({
      where: { staffSalaryOverrideComponentId: id },
    });
    if (processCount > 0) {
      throw new Error(
        `Cannot delete staff salary override component because it is referenced by ${processCount} staff salary process override row(s)`
      );
    }

    try {
      const row = await this.prisma.staffSalaryOverrideComponent.delete({
        where: { id },
        include: overrideInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Staff salary override component not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: staff salary override component is referenced by other records");
      }
      throw e;
    }
  }
}

export const staffSalaryOverrideComponentService = new StaffSalaryOverrideComponentService();

