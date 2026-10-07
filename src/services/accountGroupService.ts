import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";

const accountGroupInclude = {
  heads: { orderBy: { rank: "asc" as const } },
  subHeads: { orderBy: { rank: "asc" as const } },
  accountCharts: { orderBy: { rank: "asc" as const } },
} satisfies Prisma.AccountGroupInclude;

export type AccountGroupWithRelations = Prisma.AccountGroupGetPayload<{
  include: typeof accountGroupInclude;
}>;

export class AccountGroupService {
  private prisma = prisma;

  async getAll(): Promise<AccountGroupWithRelations[]> {
    return this.prisma.accountGroup.findMany({
      include: accountGroupInclude,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
  }

  async getById(id: number): Promise<AccountGroupWithRelations | null> {
    return this.prisma.accountGroup.findUnique({
      where: { id },
      include: accountGroupInclude,
    });
  }
}

export const accountGroupService = new AccountGroupService();
