import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

const componentInclude = {
  account: { select: { id: true, accountDescription: true } },
  _count: { select: { administrativeExpenses: true } },
} satisfies Prisma.AdministrativeExpenseComponentInclude;

type ComponentRow = Prisma.AdministrativeExpenseComponentGetPayload<{
  include: typeof componentInclude;
}>;

export interface AdministrativeExpenseComponentAccountSummary {
  id: number;
  accountDescription: string;
}

export interface AdministrativeExpenseComponentData {
  id: string;
  name: string;
  status: Status;
  accountId: number | null;
  account: AdministrativeExpenseComponentAccountSummary | null;
  expenseCount: number;
}

export interface ListAdministrativeExpenseComponentsParams {
  q?: string;
  status?: Status | "All";
  accountId?: number;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  );
}

function mapRow(row: ComponentRow): AdministrativeExpenseComponentData {
  const { _count, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    status: rest.status,
    accountId: rest.accountId,
    account: rest.account,
    expenseCount: _count.administrativeExpenses,
  };
}

export class AdministrativeExpenseComponentService {
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
    const existing = await this.prisma.administrativeExpenseComponent.findFirst({
      where: {
        name,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An administrative expense component with this name already exists");
    }
  }

  async create(input: {
    name: string;
    status?: Status;
    accountId?: number | null;
  }): Promise<AdministrativeExpenseComponentData> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("name is required");
    }

    await this.assertNameUnique(name);
    await this.validateAccountId(input.accountId);

    const row = await this.prisma.administrativeExpenseComponent.create({
      data: {
        name,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      },
      include: componentInclude,
    });

    return mapRow(row);
  }

  async list(
    params: ListAdministrativeExpenseComponentsParams = {}
  ): Promise<{
    administrativeExpenseComponents: AdministrativeExpenseComponentData[];
    count: number;
  }> {
    const where: Prisma.AdministrativeExpenseComponentWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.accountId !== undefined) {
      where.accountId = params.accountId;
    }

    if (params.q?.trim()) {
      where.name = { contains: params.q.trim() };
    }

    const rows = await this.prisma.administrativeExpenseComponent.findMany({
      where,
      include: componentInclude,
      orderBy: { name: "asc" },
    });

    return {
      administrativeExpenseComponents: rows.map(mapRow),
      count: rows.length,
    };
  }

  async getById(id: string): Promise<AdministrativeExpenseComponentData | null> {
    const row = await this.prisma.administrativeExpenseComponent.findUnique({
      where: { id },
      include: componentInclude,
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: { name?: string; status?: Status; accountId?: number | null }
  ): Promise<AdministrativeExpenseComponentData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Administrative expense component not found");
    }

    if (input.name !== undefined) {
      await this.assertNameUnique(input.name.trim(), id);
    }

    if (input.accountId !== undefined) {
      await this.validateAccountId(input.accountId);
    }

    try {
      const row = await this.prisma.administrativeExpenseComponent.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        },
        include: componentInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Administrative expense component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AdministrativeExpenseComponentData> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Administrative expense component not found");
    }

    if (existing.expenseCount > 0) {
      throw new Error(
        "Cannot delete: component has administrative expense records. Remove or reassign them first."
      );
    }

    try {
      const row = await this.prisma.administrativeExpenseComponent.delete({
        where: { id },
        include: componentInclude,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Administrative expense component not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: component is referenced by other records");
      }
      throw e;
    }
  }
}

export const administrativeExpenseComponentService = new AdministrativeExpenseComponentService();
