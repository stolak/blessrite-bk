import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";

const accountHeadInclude = {
  group: true,
  subHeads: { orderBy: { rank: "asc" as const } },
  accountCharts: { orderBy: { rank: "asc" as const } },
} satisfies Prisma.AccountHeadInclude;

export type AccountHeadWithRelations = Prisma.AccountHeadGetPayload<{
  include: typeof accountHeadInclude;
}>;

export class AccountHeadService {
  private prisma = prisma;

  async getAll(filters?: { groupId?: number }): Promise<AccountHeadWithRelations[]> {
    return this.prisma.accountHead.findMany({
      where:
        filters?.groupId !== undefined
          ? {
              groupId: filters.groupId,
            }
          : undefined,
      include: accountHeadInclude,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
  }

  async getById(id: number): Promise<AccountHeadWithRelations | null> {
    return this.prisma.accountHead.findUnique({
      where: { id },
      include: accountHeadInclude,
    });
  }
}

export const accountHeadService = new AccountHeadService();
