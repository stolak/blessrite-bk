import prisma from "../utils/prisma";
import { randomUUID } from "crypto";

export interface ActivePeriodData {
  id: string;
  startDate: Date;
  endDate: Date;
  updatedAt: Date;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class ActivePeriodService {
  private prisma = prisma;

  async getActivePeriod(): Promise<ActivePeriodData | null> {
    const record = await this.prisma.activePeriod.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!record) return null;
    return {
      id: record.id,
      startDate: record.startDate,
      endDate: record.endDate,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Upsert a singleton record. If multiple exist (shouldn't happen), keeps the
   * newest and deletes the rest.
   */
  async upsertActivePeriod(input: {
    startDate: Date;
    endDate: Date;
  }): Promise<ActivePeriodData> {
    if (input.startDate.getTime() > input.endDate.getTime()) {
      throw new Error("startDate must be before or equal to endDate");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.activePeriod.findFirst({
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });

        const id = existing?.id ?? randomUUID();

        const saved = existing
          ? await tx.activePeriod.update({
              where: { id },
              data: {
                startDate: input.startDate,
                endDate: input.endDate,
              },
            })
          : await tx.activePeriod.create({
              data: {
                id,
                startDate: input.startDate,
                endDate: input.endDate,
              },
            });

        // Enforce singleton table.
        await tx.activePeriod.deleteMany({ where: { id: { not: id } } });

        return {
          id: saved.id,
          startDate: saved.startDate,
          endDate: saved.endDate,
          updatedAt: saved.updatedAt,
        };
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("ActivePeriod not found");
      }
      throw e;
    }
  }
}

export const activePeriodService = new ActivePeriodService();
