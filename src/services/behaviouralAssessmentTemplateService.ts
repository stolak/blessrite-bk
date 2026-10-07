import prisma from "../utils/prisma";
import { applyStatusFilter, isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  parent: { select: { id: true, name: true, version: true } },
  behaviouralAssessmentComponents: {
    select: { id: true, name: true, maxScore: true, orderNo: true, status: true },
    orderBy: { orderNo: "asc" as const },
  },
  _count: { select: { behaviouralAssessmentComponents: true, children: true } },
} satisfies Prisma.BehaviouralAssessmentTemplateInclude;

type Row = Prisma.BehaviouralAssessmentTemplateGetPayload<{ include: typeof include }>;

export interface BehaviouralAssessmentTemplateData {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isLocked: boolean;
  parentId: string | null;
  parent: Row["parent"];
  status: Status;
  components: Array<{
    id: string;
    name: string;
    maxScore: string;
    orderNo: number;
    status: Status;
  }>;
  componentCount: number;
  childCount: number;
}

function mapRow(row: Row): BehaviouralAssessmentTemplateData {
  const { _count, behaviouralAssessmentComponents, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    description: rest.description,
    version: rest.version,
    isLocked: rest.isLocked,
    parentId: rest.parentId,
    parent: rest.parent,
    status: rest.status,
    components: behaviouralAssessmentComponents.map((component) => ({
      ...component,
      maxScore: component.maxScore.toString(),
    })),
    componentCount: _count.behaviouralAssessmentComponents,
    childCount: _count.children,
  };
}

export class BehaviouralAssessmentTemplateService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    version?: number;
    isLocked?: boolean;
    parentId?: string | null;
    status?: Status;
  }): Promise<BehaviouralAssessmentTemplateData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    const parentId = input.parentId?.trim() || null;
    if (parentId) {
      const parent = await this.prisma.behaviouralAssessmentTemplate.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    const row = await this.prisma.behaviouralAssessmentTemplate.create({
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
    const where: Prisma.BehaviouralAssessmentTemplateWhereInput = {};
    applyStatusFilter(where, params.status);
    if (params.version !== undefined) where.version = params.version;
    if (params.isLocked !== undefined) where.isLocked = params.isLocked;
    if (params.parentId?.trim()) where.parentId = params.parentId.trim();
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const rows = await this.prisma.behaviouralAssessmentTemplate.findMany({
      where,
      include,
      orderBy: [{ name: "asc" }, { version: "asc" }],
    });
    return { behaviouralAssessmentTemplates: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<BehaviouralAssessmentTemplateData | null> {
    const row = await this.prisma.behaviouralAssessmentTemplate.findUnique({ where: { id }, include });
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
  ): Promise<BehaviouralAssessmentTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural assessment template not found");
    if (
      existing.isLocked &&
      (input.name !== undefined || input.version !== undefined || input.parentId !== undefined)
    ) {
      throw new Error(
        "Behavioural assessment template is locked; only description, status, and isLocked may be changed"
      );
    }
    if (input.parentId) {
      const parent = await this.prisma.behaviouralAssessmentTemplate.findUnique({
        where: { id: input.parentId.trim() },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentId");
    }

    try {
      const row = await this.prisma.behaviouralAssessmentTemplate.update({
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
        throw new Error("Behavioural assessment template not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<BehaviouralAssessmentTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural assessment template not found");
    if (existing.isLocked) throw new Error("Cannot delete: behavioural assessment template is locked");
    if (existing.componentCount > 0 || existing.childCount > 0) {
      throw new Error("Cannot delete: template has components or child versions");
    }
    try {
      const row = await this.prisma.behaviouralAssessmentTemplate.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural assessment template not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: template is referenced by other records");
      }
      throw e;
    }
  }
}

export const behaviouralAssessmentTemplateService = new BehaviouralAssessmentTemplateService();
