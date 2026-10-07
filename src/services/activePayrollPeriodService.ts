import prisma from "../utils/prisma";

export interface ActivePayrollPeriodData {
  id: string;
  year: number;
  month: number;
  createdAt: Date;
  updatedAt: Date;
}

function validateYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("year must be an integer between 1900 and 2100");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month must be an integer between 1 and 12");
  }
}

export class ActivePayrollPeriodService {
  private prisma = prisma;

  async getActivePayrollPeriod(): Promise<ActivePayrollPeriodData | null> {
    const row = await this.prisma.activePayrollPeriod.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    return row;
  }

  /**
   * Upsert singleton record. If multiple rows exist, keeps the newest and deletes the rest.
   */
  async upsertActivePayrollPeriod(input: {
    year: number;
    month: number;
  }): Promise<ActivePayrollPeriodData> {
    validateYearMonth(input.year, input.month);

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.activePayrollPeriod.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      let row;
      if (existing) {
        row = await tx.activePayrollPeriod.update({
          where: { id: existing.id },
          data: { year: input.year, month: input.month },
        });
        await tx.activePayrollPeriod.deleteMany({
          where: { NOT: { id: existing.id } },
        });
      } else {
        row = await tx.activePayrollPeriod.create({
          data: { year: input.year, month: input.month },
        });
      }

      return row;
    });
  }
}

export const activePayrollPeriodService = new ActivePayrollPeriodService();
