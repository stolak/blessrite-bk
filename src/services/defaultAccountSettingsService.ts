import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";

type DbClient = Pick<Prisma.TransactionClient, "defaultAccountSettings" | "accountChart">;

export type DefaultAccountSettingsRow = Prisma.DefaultAccountSettingsGetPayload<
  Record<string, never>
>;
export type AccountChartBySettingsIdRow = Prisma.AccountChartGetPayload<{
  include: {
    group: true;
    head: true;
    subhead: true;
  };
}>;

export class DefaultAccountSettingsService {
  private prisma = prisma;

  async list(): Promise<DefaultAccountSettingsRow[]> {
    return this.prisma.defaultAccountSettings.findMany({
      orderBy: { settingsId: "asc" },
    });
  }

  /**
   * Resolve `accountId` from default account settings, then return the account chart row.
   */
  async getAccountChartBySettingsId(
    settingsId: string,
    db?: DbClient
  ): Promise<{
    settingsId: string;
    accountId: number;
    accountChart: AccountChartBySettingsIdRow;
  }> {
    const prisma = db ?? this.prisma;
    const trimmedId = settingsId.trim();
    if (!trimmedId) {
      throw new Error("settingsId is required");
    }

    const row = await prisma.defaultAccountSettings.findUnique({
      where: { settingsId: trimmedId },
      select: { settingsId: true, accountId: true },
    });
    if (!row) {
      const splitttedId = trimmedId.split("_");

      throw new Error(`Default account settings: ${splitttedId.join(" ")} not found`);
    }
    if (!row.accountId) {
      throw new Error("Default account settings has no accountId configured");
    }

    const accountChart = await prisma.accountChart.findUnique({
      where: { id: row.accountId },
      include: {
        group: true,
        head: true,
        subhead: true,
      },
    });
    if (!accountChart) {
      throw new Error("Account chart not found for configured accountId");
    }

    return {
      settingsId: row.settingsId,
      accountId: row.accountId,
      accountChart,
    };
  }

  /**
   * Partial update by business key `settingsId`.
   * At least one of `settings` or `accountId` must be provided.
   */
  async update(
    settingsId: string,
    input: { settings?: string; accountId?: number | null }
  ): Promise<DefaultAccountSettingsRow> {
    const trimmedId = settingsId.trim();
    if (!trimmedId) {
      throw new Error("settingsId is required");
    }

    const hasSettings = input.settings !== undefined;
    const hasAccountId = input.accountId !== undefined;
    if (!hasSettings && !hasAccountId) {
      throw new Error("At least one field must be provided to update");
    }

    if (hasSettings) {
      if (typeof input.settings !== "string") {
        throw new Error("settings must be a string when provided");
      }
      if (!input.settings.trim()) {
        throw new Error("settings cannot be empty when provided");
      }
    }

    if (hasAccountId && input.accountId !== null && input.accountId !== undefined) {
      const aid = input.accountId;
      if (!Number.isInteger(aid) || aid < 1) {
        throw new Error("accountId must be a positive integer when provided");
      }
      const account = await this.prisma.accountChart.findUnique({
        where: { id: aid },
        select: { id: true },
      });
      if (!account) {
        throw new Error("Invalid accountId: account chart not found");
      }
    }

    const existing = await this.prisma.defaultAccountSettings.findUnique({
      where: { settingsId: trimmedId },
    });
    if (!existing) {
      throw new Error("Default account settings not found");
    }

    const data: Prisma.DefaultAccountSettingsUpdateInput = {};
    if (hasSettings) {
      data.settings = input.settings!.trim();
    }
    if (hasAccountId) {
      if (input.accountId === null) {
        data.account = { disconnect: true };
      } else {
        data.account = { connect: { id: input.accountId } };
      }
    }

    return this.prisma.defaultAccountSettings.update({
      where: { settingsId: trimmedId },
      data,
    });
  }
}

export const defaultAccountSettingsService = new DefaultAccountSettingsService();
