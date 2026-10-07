import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface DepartmentData {
  id: string;
  name: string;
  status: Status;
}

export interface ListDepartmentsParams {
  q?: string;
  status?: Status | "All";
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: string }).code === "string";
}

export class DepartmentService {
  private prisma = prisma;

  private async assertNameUnique(name: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: {
        name,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("A department with this name already exists");
    }
  }

  async create(input: { name: string; status?: Status }): Promise<DepartmentData> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("name is required");
    }

    await this.assertNameUnique(name);

    return this.prisma.department.create({
      data: {
        name,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async list(params: ListDepartmentsParams = {}): Promise<{
    departments: DepartmentData[];
    count: number;
  }> {
    const where: Prisma.DepartmentWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q?.trim()) {
      where.name = { contains: params.q.trim() };
    }

    const rows = await this.prisma.department.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { departments: rows, count: rows.length };
  }

  async getById(id: string): Promise<DepartmentData | null> {
    return this.prisma.department.findUnique({ where: { id } });
  }

  async update(
    id: string,
    input: { name?: string; status?: Status }
  ): Promise<DepartmentData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Department not found");
    }

    if (input.name !== undefined) {
      await this.assertNameUnique(input.name.trim(), id);
    }

    try {
      return await this.prisma.department.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Department not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<DepartmentData> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Department not found");
    }

    try {
      return await this.prisma.department.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Department not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: department is referenced by other records");
      }
      throw e;
    }
  }
}

export const departmentService = new DepartmentService();
