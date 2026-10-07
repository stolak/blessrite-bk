import prisma from "../utils/prisma";
import {
  applyStatusFilter,
  isPrismaKnownErrorWithCode,
  newVersionId,
} from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  parentTemplate: { select: { id: true, name: true, versionId: true } },
  components: { select: { id: true, name: true, maxScore: true, weight: true, orderNo: true } },
  _count: { select: { components: true, classAssignments: true } },
} satisfies Prisma.AssessmentTemplateInclude;

type Row = Prisma.AssessmentTemplateGetPayload<{ include: typeof include }>;

export interface AssessmentTemplateData {
  id: string;
  name: string;
  description: string | null;
  versionId: string;
  parentTemplateId: string | null;
  parentTemplate: Row["parentTemplate"];
  status: Status;
  componentCount: number;
  classAssignmentCount: number;
  components: Row["components"];
}

function mapRow(row: Row): AssessmentTemplateData {
  const { _count, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    description: rest.description,
    versionId: rest.versionId,
    parentTemplateId: rest.parentTemplateId,
    parentTemplate: rest.parentTemplate,
    status: rest.status,
    componentCount: _count.components,
    classAssignmentCount: _count.classAssignments,
    components: rest.components,
  };
}

export class AssessmentTemplateService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    versionId?: string;
    parentTemplateId?: string | null;
    status?: Status;
  }): Promise<AssessmentTemplateData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    let versionId = input.versionId?.trim() || "";
    let parentTemplateId = input.parentTemplateId?.trim() || null;

    if (parentTemplateId) {
      const parent = await this.prisma.assessmentTemplate.findUnique({
        where: { id: parentTemplateId },
        select: { id: true, versionId: true },
      });
      if (!parent) throw new Error("Invalid parentTemplateId");
      versionId = parent.versionId;
    } else if (!versionId) {
      versionId = newVersionId();
    }

    const row = await this.prisma.assessmentTemplate.create({
      data: {
        name,
        description: input.description?.trim() || null,
        versionId,
        parentTemplateId,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    versionId?: string;
    parentTemplateId?: string;
  }) {
    const where: Prisma.AssessmentTemplateWhereInput = {};
    applyStatusFilter(where, params.status);
    if (params.versionId?.trim()) where.versionId = params.versionId.trim();
    if (params.parentTemplateId?.trim()) where.parentTemplateId = params.parentTemplateId.trim();
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }
    const rows = await this.prisma.assessmentTemplate.findMany({
      where,
      include,
      orderBy: [{ name: "asc" }, { versionId: "asc" }],
    });
    return { assessmentTemplates: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<AssessmentTemplateData | null> {
    const row = await this.prisma.assessmentTemplate.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      versionId?: string;
      parentTemplateId?: string | null;
      status?: Status;
    }
  ): Promise<AssessmentTemplateData> {
    if (input.name !== undefined && !input.name.trim()) throw new Error("name cannot be empty");
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment template not found");

    if (input.parentTemplateId) {
      const parent = await this.prisma.assessmentTemplate.findUnique({
        where: { id: input.parentTemplateId.trim() },
        select: { id: true },
      });
      if (!parent) throw new Error("Invalid parentTemplateId");
    }

    try {
      const row = await this.prisma.assessmentTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : input.description.trim() || null }
            : {}),
          ...(input.versionId !== undefined ? { versionId: input.versionId.trim() } : {}),
          ...(input.parentTemplateId !== undefined
            ? { parentTemplateId: input.parentTemplateId?.trim() || null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assessment template not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AssessmentTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment template not found");
    if (existing.componentCount > 0 || existing.classAssignmentCount > 0) {
      throw new Error("Cannot delete: template has components or class assignments");
    }
    try {
      const row = await this.prisma.assessmentTemplate.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assessment template not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: template is referenced by other records");
      }
      throw e;
    }
  }
}

export const assessmentTemplateService = new AssessmentTemplateService();
