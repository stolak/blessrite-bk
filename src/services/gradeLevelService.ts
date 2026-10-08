import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface GradeLevelData {
  id: string;
  name: string;
  status: Status;
}

export interface ListGradeLevelsParams {
  q?: string;
  status?: Status | "All";
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: string }).code === "string";
}

export class GradeLevelService {
  private prisma = prisma;

  private async assertNameUnique(name: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.gradeLevel.findFirst({
      where: {
        name,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("A grade level with this name already exists");
    }
  }

  async create(input: { name: string; status?: Status }): Promise<GradeLevelData> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("name is required");
    }

    await this.assertNameUnique(name);

    return this.prisma.gradeLevel.create({
      data: {
        name,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async list(params: ListGradeLevelsParams = {}): Promise<{
    gradeLevels: GradeLevelData[];
    count: number;
  }> {
    const where: Prisma.GradeLevelWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q?.trim()) {
      where.name = { contains: params.q.trim() };
    }

    const rows = await this.prisma.gradeLevel.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { gradeLevels: rows, count: rows.length };
  }

  async getById(id: string): Promise<GradeLevelData | null> {
    return this.prisma.gradeLevel.findUnique({ where: { id } });
  }

  async update(
    id: string,
    input: { name?: string; status?: Status }
  ): Promise<GradeLevelData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Grade level not found");
    }

    if (input.name !== undefined) {
      await this.assertNameUnique(input.name.trim(), id);
    }

    try {
      return await this.prisma.gradeLevel.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Grade level not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<GradeLevelData> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Grade level not found");
    }

    const staffCount = await this.prisma.staff.count({ where: { gradeLevelId: id } });
    if (staffCount > 0) {
      throw new Error(
        `Cannot delete grade level because it is assigned to ${staffCount} staff record(s)`
      );
    }

    try {
      return await this.prisma.gradeLevel.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Grade level not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: grade level is referenced by other records");
      }
      throw e;
    }
  }
}

export const gradeLevelService = new GradeLevelService();
