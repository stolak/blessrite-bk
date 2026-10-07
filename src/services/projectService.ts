import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface ProjectTransactionSummary {
  id: string;
  referenceNo: string | null;
  transactionType: string;
  transactionDate: Date;
}

export interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  CreatedBy?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  /** Present on list responses */
  _count?: { inventoryTransactions: number };
  /** Present on create/get/update/delete when loaded */
  inventoryTransactions?: ProjectTransactionSummary[];
}

export interface ListProjectsParams {
  q?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}

const includeList = {
  CreatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  _count: { select: { inventoryTransactions: true } },
} satisfies Prisma.ProjectInclude;

const includeDetail = {
  CreatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  inventoryTransactions: {
    orderBy: { transactionDate: "desc" as const },
    select: { id: true, referenceNo: true, transactionType: true, transactionDate: true },
  },
} satisfies Prisma.ProjectInclude;

export class ProjectService {
  private prisma = prisma;

  async createProject(input: {
    name: string;
    description?: string | null;
    status?: Status;
    createdById?: string | null;
  }): Promise<ProjectData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    return await this.prisma.project.create({
      data: {
        name,
        description: input.description === undefined || input.description === null ? null : String(input.description),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.createdById !== undefined ? { createdById: input.createdById } : {}),
      },
      include: includeDetail,
    });
  }

  async listProjects(params: ListProjectsParams = {}): Promise<{
    projects: ProjectData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: includeList,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { projects: rows, pagination: { page, limit, total, totalPages } };
  }

  async getProjectById(id: string): Promise<ProjectData | null> {
    return await this.prisma.project.findUnique({
      where: { id },
      include: includeDetail,
    });
  }

  async updateProject(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      status?: Status;
    }
  ): Promise<ProjectData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const existing = await this.getProjectById(id);
    if (!existing) throw new Error("Project not found");

    try {
      return await this.prisma.project.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : String(input.description) }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
        include: includeDetail,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Project not found");
      }
      throw e;
    }
  }

  async deleteProject(id: string): Promise<ProjectData> {
    const existing = await this.getProjectById(id);
    if (!existing) throw new Error("Project not found");

    try {
      return await this.prisma.project.delete({
        where: { id },
        include: includeDetail,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Project cannot be deleted while inventory transactions reference it");
      }
      throw e;
    }
  }
}

export const projectService = new ProjectService();
