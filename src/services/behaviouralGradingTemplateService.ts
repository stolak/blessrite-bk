import prisma from "../utils/prisma";
import { applyStatusFilter, isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  parent: { select: { id: true, name: true, version: true } },
  gradingItems: {
    select: {
      id: true,
      grade: true,
      lowBoundary: true,
      highBoundary: true,
      remark: true,
      gradePoint: true,
    },
    orderBy: { lowBoundary: "desc" as const },
  },
  _count: { select: { gradingItems: true, children: true } },
} satisfies Prisma.BehaviouralGradingTemplateInclude;

type Row = Prisma.BehaviouralGradingTemplateGetPayload<{ include: typeof include }>;

export interface BehaviouralGradingItemSummary {
  id: string;
  grade: string;
  lowBoundary: string;
  highBoundary: string;
  remark: string | null;
  gradePoint: string;
}

export interface BehaviouralGradingTemplateData {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isLocked: boolean;
  parentId: string | null;
  parent: Row["parent"];
  status: Status;
  gradingItems: BehaviouralGradingItemSummary[];
  itemCount: number;
  childCount: number;
}

function mapItem(item: Row["gradingItems"][number]): BehaviouralGradingItemSummary {
  return {
    id: item.id,
    grade: item.grade,
    lowBoundary: item.lowBoundary.toString(),
    highBoundary: item.highBoundary.toString(),
    remark: item.remark,
    gradePoint: item.gradePoint.toString(),
  };
}

function mapRow(row: Row): BehaviouralGradingTemplateData {
  const { _count, gradingItems, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    description: rest.description,
    version: rest.version,
    isLocked: rest.isLocked,
    parentId: rest.parentId,
    parent: rest.parent,
    status: rest.status,
    gradingItems: gradingItems.map(mapItem),
    itemCount: _count.gradingItems,
    childCount: _count.children,
  };
}

export class BehaviouralGradingTemplateService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    version?: number;
    isLocked?: boolean;
    parentId?: string | null;
    status?: Status;
  }): Promise<BehaviouralGradingTemplateData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    const parentId = input.parentId?.trim() || null;
    if (parentId) {
      const parent = await this.prisma.behaviouralGradingTemplate.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    const row = await this.prisma.behaviouralGradingTemplate.create({
      data: {
        name,
        description: input.description?.trim() || null,
        version: input.version ?? 1,
        parentId,
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    version?: number;
    isLocked?: boolean;
    parentId?: string;
  }) {
    const where: Prisma.BehaviouralGradingTemplateWhereInput = {};
    applyStatusFilter(where, params.status);
    if (params.version !== undefined) where.version = params.version;
    if (params.isLocked !== undefined) where.isLocked = params.isLocked;
    if (params.parentId?.trim()) where.parentId = params.parentId.trim();
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const rows = await this.prisma.behaviouralGradingTemplate.findMany({
      where,
      include,
      orderBy: [{ name: "asc" }, { version: "asc" }],
    });
    return { behaviouralGradingTemplates: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<BehaviouralGradingTemplateData | null> {
    const row = await this.prisma.behaviouralGradingTemplate.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      version?: number;
      isLocked?: boolean;
      parentId?: string | null;
      status?: Status;
    }
  ): Promise<BehaviouralGradingTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural grading template not found");
    if (
      existing.isLocked &&
      (input.name !== undefined || input.version !== undefined || input.parentId !== undefined)
    ) {
      throw new Error(
        "Behavioural grading template is locked; only description, status, and isLocked may be changed"
      );
    }
    if (input.parentId) {
      const parent = await this.prisma.behaviouralGradingTemplate.findUnique({
        where: { id: input.parentId.trim() },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    try {
      const row = await this.prisma.behaviouralGradingTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : input.description.trim() || null }
            : {}),
          ...(input.version !== undefined ? { version: input.version } : {}),
          ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId?.trim() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural grading template not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<BehaviouralGradingTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural grading template not found");
    if (existing.isLocked) throw new Error("Cannot delete: behavioural grading template is locked");
    if (existing.itemCount > 0 || existing.childCount > 0) {
      throw new Error("Cannot delete: template has grading items or child versions");
    }
    try {
      const row = await this.prisma.behaviouralGradingTemplate.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural grading template not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: template is referenced by other records");
      }
      throw e;
    }
  }
}

export const behaviouralGradingTemplateService = new BehaviouralGradingTemplateService();
