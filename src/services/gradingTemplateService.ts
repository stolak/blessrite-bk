import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  parent: { select: { id: true, name: true, version: true } },
  items: {
    select: {
      id: true,
      grade: true,
      minScore: true,
      maxScore: true,
      remark: true,
      gradePoint: true,
    },
    orderBy: { minScore: "desc" as const },
  },
  _count: { select: { items: true, children: true, classAssessmentTemplates: true } },
} satisfies Prisma.GradingTemplateInclude;

type Row = Prisma.GradingTemplateGetPayload<{ include: typeof include }>;

export interface GradingTemplateItemSummary {
  id: string;
  grade: string;
  minScore: string;
  maxScore: string;
  remark: string | null;
  gradePoint: string;
}

export interface GradingTemplateData {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isLocked: boolean;
  parentId: string | null;
  parent: Row["parent"];
  items: GradingTemplateItemSummary[];
  itemCount: number;
  classAssignmentCount: number;
  childCount: number;
}

function mapItem(item: Row["items"][number]): GradingTemplateItemSummary {
  return {
    id: item.id,
    grade: item.grade,
    minScore: item.minScore.toString(),
    maxScore: item.maxScore.toString(),
    remark: item.remark,
    gradePoint: item.gradePoint.toString(),
  };
}

function mapRow(row: Row): GradingTemplateData {
  const { _count, items, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    description: rest.description,
    version: rest.version,
    isLocked: rest.isLocked,
    parentId: rest.parentId,
    parent: rest.parent,
    items: items.map(mapItem),
    itemCount: _count.items,
    classAssignmentCount: _count.classAssessmentTemplates,
    childCount: _count.children,
  };
}

export class GradingTemplateService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    version: number;
    isLocked?: boolean;
    parentId?: string | null;
  }): Promise<GradingTemplateData> {
    const name = input.name.trim();
    const version = Number(input.version);
    if (!name) throw new Error("name is required");
    if (Number.isNaN(version) && version !== undefined)
      throw new Error(`version must be a number, got ${version}`);

    const parentId = input.parentId?.trim() || null;
    if (parentId) {
      const parent = await this.prisma.gradingTemplate.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    const row = await this.prisma.gradingTemplate.create({
      data: {
        name,
        description: input.description?.trim() || null,
        version,
        parentId,
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: { q?: string; version?: number; isLocked?: boolean; parentId?: string }) {
    const where: Prisma.GradingTemplateWhereInput = {};
    if (params.version !== undefined) where.version = Number(params.version);
    if (params.isLocked !== undefined) where.isLocked = params.isLocked;
    if (params.parentId?.trim()) where.parentId = params.parentId.trim();
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }
    const rows = await this.prisma.gradingTemplate.findMany({
      where,
      include,
      orderBy: [{ name: "asc" }, { version: "asc" }],
    });
    return { gradingTemplates: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<GradingTemplateData | null> {
    const row = await this.prisma.gradingTemplate.findUnique({ where: { id }, include });
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
    }
  ): Promise<GradingTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Grading template not found");
    if (
      existing.isLocked &&
      (input.name !== undefined || input.version !== undefined || input.parentId !== undefined)
    ) {
      throw new Error("Grading template is locked; only description and isLocked may be changed");
    }
    if (input.parentId) {
      const parent = await this.prisma.gradingTemplate.findUnique({
        where: { id: input.parentId.trim() },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    try {
      const row = await this.prisma.gradingTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : input.description.trim() || null }
            : {}),
          ...(input.version !== undefined ? { version: input.version } : {}),
          ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId?.trim() || null } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025")
        throw new Error("Grading template not found");
      throw e;
    }
  }

  async delete(id: string): Promise<GradingTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Grading template not found");
    if (existing.isLocked) throw new Error("Cannot delete: grading template is locked");
    if (existing.itemCount > 0 || existing.classAssignmentCount > 0 || existing.childCount > 0) {
      throw new Error("Cannot delete: grading template has items, assignments, or child versions");
    }
    try {
      const row = await this.prisma.gradingTemplate.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025")
        throw new Error("Grading template not found");
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: grading template is referenced by other records");
      }
      throw e;
    }
  }
}

export const gradingTemplateService = new GradingTemplateService();
