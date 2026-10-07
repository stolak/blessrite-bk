import prisma from "../utils/prisma";
import { Prisma, SalaryComponentType, Status } from "@prisma/client";

const salaryComponentInclude = {
  account: { select: { id: true, accountDescription: true } },
} satisfies Prisma.SalaryComponentInclude;

export interface SalaryComponentAccountSummary {
  id: number;
  accountDescription: string;
}

export interface SalaryComponentData {
  id: string;
  name: string;
  shortName: string | null;
  type: SalaryComponentType;
  status: Status;
  isTaxable: boolean;
  isPensionable: boolean;
  isStatutory: boolean;
  isFunction: boolean;
  functionPercentage: string | null;
  functionElements: string[] | null;
  accountId: number | null;
  account: SalaryComponentAccountSummary | null;
  rank: number;
}

export interface ListSalaryComponentsParams {
  q?: string;
  status?: Status | "All";
  type?: SalaryComponentType;
  isFunction?: boolean;
  accountId?: number;
}

type SalaryComponentRow = Prisma.SalaryComponentGetPayload<{
  include: typeof salaryComponentInclude;
}>;

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  );
}

function parseFunctionElementsJson(value: Prisma.JsonValue | null): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return null;
    ids.push(item.trim());
  }
  return ids;
}

function mapRow(row: SalaryComponentRow): SalaryComponentData {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    type: row.type,
    status: row.status,
    isTaxable: row.isTaxable,
    isPensionable: row.isPensionable,
    isStatutory: row.isStatutory,
    isFunction: row.isFunction,
    functionPercentage: row.functionPercentage?.toString() ?? null,
    functionElements: parseFunctionElementsJson(row.functionElements),
    accountId: row.accountId,
    account: row.account,
    rank: row.rank,
  };
}

export class SalaryComponentService {
  private prisma = prisma;

  private async validateAccountId(accountId?: number | null): Promise<void> {
    if (accountId === undefined || accountId === null) {
      return;
    }
    if (!Number.isInteger(accountId) || accountId < 1) {
      throw new Error("accountId must be a positive integer when provided");
    }
    const account = await this.prisma.accountChart.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) {
      throw new Error("Invalid accountId: account chart not found");
    }
  }

  private async assertNameUnique(name: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.salaryComponent.findFirst({
      where: {
        name,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("A salary component with this name already exists");
    }
  }

  private parseFunctionPercentage(
    value: string | number | null | undefined
  ): Prisma.Decimal | null {
    if (value === undefined || value === null || value === "") return null;
    const d = new Prisma.Decimal(value);
    if (d.isNegative()) {
      throw new Error("functionPercentage must be zero or greater");
    }
    return d;
  }

  private async validateFunctionConfig(input: {
    isFunction: boolean;
    functionPercentage?: string | number | null;
    functionElements?: string[] | null;
    excludeId?: string;
  }): Promise<{
    functionPercentage: Prisma.Decimal | null;
    functionElements: Prisma.InputJsonValue | typeof Prisma.DbNull;
  }> {
    if (!input.isFunction) {
      return { functionPercentage: null, functionElements: Prisma.DbNull };
    }

    if (input.functionPercentage === undefined || input.functionPercentage === null) {
      throw new Error("functionPercentage is required when isFunction is true");
    }

    const elements = input.functionElements ?? [];
    if (!elements.length) {
      throw new Error("functionElements must be a non-empty array when isFunction is true");
    }

    const uniqueIds = [...new Set(elements)];
    if (input.excludeId && uniqueIds.includes(input.excludeId)) {
      throw new Error("functionElements cannot include the component's own id");
    }

    const referenced = await this.prisma.salaryComponent.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, isFunction: true },
    });
    if (referenced.length !== uniqueIds.length) {
      throw new Error("One or more functionElements salary component ids are invalid");
    }
    // const nestedFunction = referenced.find((r) => r.isFunction);
    // if (nestedFunction) {
    //   throw new Error("functionElements cannot reference another function-type salary component");
    // }

    return {
      functionPercentage: this.parseFunctionPercentage(input.functionPercentage),
      functionElements: uniqueIds,
    };
  }

  async create(input: {
    name: string;
    shortName?: string | null;
    type: SalaryComponentType;
    status?: Status;
    isTaxable?: boolean;
    isPensionable?: boolean;
    isStatutory?: boolean;
    isFunction?: boolean;
    functionPercentage?: string | number | null;
    functionElements?: string[] | null;
    accountId?: number | null;
    rank?: number;
  }): Promise<SalaryComponentData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    await this.assertNameUnique(name);
    await this.validateAccountId(input.accountId);

    const isFunction = input.isFunction ?? false;
    const { functionPercentage, functionElements } = await this.validateFunctionConfig({
      isFunction,
      functionPercentage: input.functionPercentage,
      functionElements: input.functionElements,
    });

    const row = await this.prisma.salaryComponent.create({
      data: {
        name,
        shortName: input.shortName?.trim() ? input.shortName.trim() : null,
        type: input.type,
        isFunction,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.isTaxable !== undefined ? { isTaxable: input.isTaxable } : {}),
        ...(input.isPensionable !== undefined ? { isPensionable: input.isPensionable } : {}),
        ...(input.isStatutory !== undefined ? { isStatutory: input.isStatutory } : {}),
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        ...(input.rank !== undefined ? { rank: input.rank } : {}),
        functionPercentage,
        functionElements,
      },
      include: salaryComponentInclude,
    });

    return mapRow(row);
  }

  async list(params: ListSalaryComponentsParams = {}): Promise<{
    salaryComponents: SalaryComponentData[];
    count: number;
  }> {
    const where: Prisma.SalaryComponentWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.type) where.type = params.type;
    if (params.isFunction !== undefined) where.isFunction = params.isFunction;
    if (params.accountId !== undefined) where.accountId = params.accountId;

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q } },
        { shortName: { contains: q } },
      ];
    }

    const rows = await this.prisma.salaryComponent.findMany({
      where,
      include: salaryComponentInclude,
      orderBy: [{ type: "asc" }, { rank: "asc" }, { name: "asc" }],
    });

    return { salaryComponents: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<SalaryComponentData | null> {
    const row = await this.prisma.salaryComponent.findUnique({
      where: { id },
      include: salaryComponentInclude,
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      name?: string;
      shortName?: string | null;
      type?: SalaryComponentType;
      status?: Status;
      isTaxable?: boolean;
      isPensionable?: boolean;
      isStatutory?: boolean;
      isFunction?: boolean;
      functionPercentage?: string | number | null;
      functionElements?: string[] | null;
      accountId?: number | null;
      rank?: number;
    }
  ): Promise<SalaryComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Salary component not found");

    if (input.accountId !== undefined) {
      await this.validateAccountId(input.accountId);
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }
    if (input.name !== undefined) {
      await this.assertNameUnique(input.name.trim(), id);
    }

    const isFunction = input.isFunction ?? existing.isFunction;
    const functionConfig = await this.validateFunctionConfig({
      isFunction,
      functionPercentage:
        input.functionPercentage !== undefined
          ? input.functionPercentage
          : existing.functionPercentage,
      functionElements:
        input.functionElements !== undefined ? input.functionElements : existing.functionElements,
      excludeId: id,
    });

    try {
      const row = await this.prisma.salaryComponent.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.shortName !== undefined
            ? { shortName: input.shortName?.trim() ? input.shortName.trim() : null }
            : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.isTaxable !== undefined ? { isTaxable: input.isTaxable } : {}),
          ...(input.isPensionable !== undefined ? { isPensionable: input.isPensionable } : {}),
          ...(input.isStatutory !== undefined ? { isStatutory: input.isStatutory } : {}),
          ...(input.isFunction !== undefined ? { isFunction: input.isFunction } : {}),
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
          ...(input.rank !== undefined ? { rank: input.rank } : {}),
          functionPercentage: functionConfig.functionPercentage,
          functionElements: functionConfig.functionElements,
        },
        include: salaryComponentInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Salary component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<SalaryComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Salary component not found");

    const chartCount = await this.prisma.salaryChart.count({ where: { componentId: id } });
    if (chartCount > 0) {
      throw new Error(
        `Cannot delete salary component because it is used on ${chartCount} salary chart row(s)`
      );
    }

    try {
      const row = await this.prisma.salaryComponent.delete({
        where: { id },
        include: salaryComponentInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Salary component not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: salary component is referenced by other records");
      }
      throw e;
    }
  }
}

export const salaryComponentService = new SalaryComponentService();
