import { AccountType, Prisma, Status } from "@prisma/client";
import prisma from "../utils/prisma";

const accountSubheadInclude = {
  group: true,
  head: true,
} satisfies Prisma.AccountSubheadInclude;

export type AccountSubheadWithRelations = Prisma.AccountSubheadGetPayload<{
  include: typeof accountSubheadInclude;
}>;

export type ListAccountSubheadsFilters = {
  groupId?: number;
  headId?: number;
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

export class AccountSubheadService {
  private prisma = prisma;

  /** Name must be unique per account head (trimmed exact match). */
  private async assertNameUniqueForHead(
    headId: number,
    name: string,
    excludeId?: number
  ): Promise<void> {
    const existing = await this.prisma.accountSubhead.findFirst({
      where: {
        headId,
        name,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An account subhead with this name already exists for this account head");
    }
  }

  /** Code must be globally unique among all subheads (when set). */
  private async assertCodeGloballyUnique(code: string, excludeId?: number): Promise<void> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new Error("code cannot be empty");
    }
    const existing = await this.prisma.accountSubhead.findFirst({
      where: {
        code: trimmed,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An account subhead with this code already exists");
    }
  }

  async resolveGroupIdFromHeadId(headId: number): Promise<number | null> {
    const head = await this.prisma.accountHead.findUnique({
      where: { id: headId },
      select: { groupId: true },
    });
    return head?.groupId ?? null;
  }

  async create(input: {
    headId: number;
    name: string;
    code?: string | null;
    status?: Status;
    rank?: number;
    afs?: string | null;
    paymentMethod?: string | null;
    accountType?: AccountType;
  }): Promise<AccountSubheadWithRelations> {
    const nameTrimmed = typeof input.name === "string" ? input.name.trim() : "";
    if (!nameTrimmed) {
      throw new Error("name is required");
    }

    const groupId = await this.resolveGroupIdFromHeadId(input.headId);
    if (groupId === null) {
      throw new Error("Invalid headId: account head not found");
    }

    await this.assertNameUniqueForHead(input.headId, nameTrimmed);

    let codeValue: string | null = null;
    if (input.code !== undefined && input.code !== null && String(input.code).trim().length > 0) {
      codeValue = String(input.code).trim();
      await this.assertCodeGloballyUnique(codeValue);
    }

    return this.prisma.accountSubhead.create({
      data: {
        groupId,
        headId: input.headId,
        code: codeValue,
        name: nameTrimmed,
        ...(input.status !== undefined ? { status: input.status } : {}),
        rank: input.rank ?? 0,
        afs: input.afs === undefined ? null : input.afs,
        paymentMethod: input.paymentMethod === undefined ? null : input.paymentMethod,
        ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
      },
      include: accountSubheadInclude,
    });
  }

  async list(filters: ListAccountSubheadsFilters = {}): Promise<AccountSubheadWithRelations[]> {
    const where: Prisma.AccountSubheadWhereInput = {};
    if (filters.groupId !== undefined) {
      where.groupId = filters.groupId;
    }
    if (filters.headId !== undefined) {
      where.headId = filters.headId;
    }
    if (filters.status === undefined) {
      where.status = Status.Active;
    } else if (filters.status !== "All") {
      where.status = filters.status;
    }
    if (filters.accountType !== undefined) {
      where.accountType = filters.accountType;
    }

    return this.prisma.accountSubhead.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: accountSubheadInclude,
      orderBy: [{ headId: "asc" }, { rank: "asc" }, { code: "asc" }, { name: "asc" }],
    });
  }

  async getById(id: number): Promise<AccountSubheadWithRelations | null> {
    return this.prisma.accountSubhead.findUnique({
      where: { id },
      include: accountSubheadInclude,
    });
  }

  async update(
    id: number,
    input: {
      headId?: number;
      code?: string | null;
      name?: string;
      status?: Status;
      rank?: number;
      afs?: string | null;
      paymentMethod?: string | null;
      accountType?: AccountType;
    }
  ): Promise<AccountSubheadWithRelations> {
    const current = await this.prisma.accountSubhead.findUnique({
      where: { id },
      select: { headId: true, name: true },
    });
    if (!current) {
      throw new Error("Account subhead not found");
    }

    if (input.headId !== undefined || input.name !== undefined) {
      const targetHeadId = input.headId ?? current.headId;
      const targetName = input.name !== undefined ? input.name.trim() : current.name;
      if (!targetName.trim()) {
        throw new Error("name cannot be empty");
      }
      await this.assertNameUniqueForHead(targetHeadId, targetName, id);
    }

    const data: Prisma.AccountSubheadUpdateInput = {};

    if (input.headId !== undefined) {
      const groupId = await this.resolveGroupIdFromHeadId(input.headId);
      if (groupId === null) {
        throw new Error("Invalid headId: account head not found");
      }
      data.head = { connect: { id: input.headId } };
      data.group = { connect: { id: groupId } };
    }

    if (input.code !== undefined) {
      if (input.code === null || String(input.code).trim() === "") {
        data.code = null;
      } else {
        const trimmed = String(input.code).trim();
        await this.assertCodeGloballyUnique(trimmed, id);
        data.code = trimmed;
      }
    }
    if (input.name !== undefined) {
      data.name = input.name.trim();
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.rank !== undefined) {
      data.rank = input.rank;
    }
    if (input.afs !== undefined) {
      data.afs = input.afs;
    }
    if (input.paymentMethod !== undefined) {
      data.paymentMethod = input.paymentMethod;
    }
    if (input.accountType !== undefined) {
      data.accountType = input.accountType;
    }

    try {
      return await this.prisma.accountSubhead.update({
        where: { id },
        data,
        include: accountSubheadInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Account subhead not found");
      }
      throw e;
    }
  }

  async delete(id: number): Promise<AccountSubheadWithRelations> {
    try {
      return await this.prisma.accountSubhead.delete({
        where: { id },
        include: accountSubheadInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Account subhead not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: subhead is referenced by account charts or transactions");
      }
      throw e;
    }
  }
}

export const accountSubheadService = new AccountSubheadService();
