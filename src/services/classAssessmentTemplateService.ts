import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  class: { select: { id: true, name: true, status: true } },
  template: {
    select: {
      id: true,
      name: true,
      status: true,
      versionId: true,
      components: { select: { id: true, name: true, shortName: true, maxScore: true, weight: true, orderNo: true } },
    },
  },
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
  gradeTemplate: {
    select: {
      id: true,
      name: true,
      version: true,
      isLocked: true,
      items: {
        select: {
          id: true,
          grade: true,
          minScore: true,
          maxScore: true,
          remark: true,
          gradePoint: true,
        },
      },
    },
  },
  behaviouralTemplate: {
    select: {
      id: true,
      name: true,
      version: true,
      isLocked: true,
      status: true,
      behaviouralAssessmentComponents: {
        select: { id: true, name: true, maxScore: true, orderNo: true, status: true },
        orderBy: { orderNo: "asc" as const },
      },
    },
  },
  behaviouralGradingTemplate: {
    select: {
      id: true,
      name: true,
      version: true,
      isLocked: true,
      status: true,
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
    },
  },
} satisfies Prisma.ClassAssessmentTemplateInclude;

export type ClassAssessmentTemplateData = Prisma.ClassAssessmentTemplateGetPayload<{
  include: typeof include;
}>;

export class ClassAssessmentTemplateService {
  private prisma = prisma;

  private async assertRefs(input: {
    classId: string;
    templateId: string;
    sessionId: string;
    termId: string;
    gradeTemplateId?: string | null;
    behaviouralTemplateId?: string | null;
    behaviouralGradingTemplateId?: string | null;
  }): Promise<void> {
    const [cls, template, session, term] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.assessmentTemplate.findUnique({
        where: { id: input.templateId },
        select: { id: true },
      }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);
    if (!cls) throw new Error("Invalid classId");
    if (!template) throw new Error("Invalid templateId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (input.gradeTemplateId) {
      const gradeTemplate = await this.prisma.gradingTemplate.findUnique({
        where: { id: input.gradeTemplateId },
        select: { id: true },
      });
      if (!gradeTemplate) throw new Error("Invalid gradeTemplateId");
    }
    if (input.behaviouralTemplateId) {
      const behaviouralTemplate = await this.prisma.behaviouralAssessmentTemplate.findUnique({
        where: { id: input.behaviouralTemplateId },
        select: { id: true },
      });
      if (!behaviouralTemplate) throw new Error("Invalid behaviouralTemplateId");
    }
    if (input.behaviouralGradingTemplateId) {
      const behaviouralGradingTemplate = await this.prisma.behaviouralGradingTemplate.findUnique({
        where: { id: input.behaviouralGradingTemplateId },
        select: { id: true },
      });
      if (!behaviouralGradingTemplate) throw new Error("Invalid behaviouralGradingTemplateId");
    }
  }

  async create(input: {
    classId: string;
    templateId: string;
    sessionId: string;
    termId: string;
    gradeTemplateId?: string | null;
    behaviouralTemplateId?: string | null;
    behaviouralGradingTemplateId?: string | null;
  }): Promise<ClassAssessmentTemplateData> {
    const payload = {
      classId: input.classId.trim(),
      templateId: input.templateId.trim(),
      sessionId: input.sessionId.trim(),
      termId: input.termId.trim(),
      gradeTemplateId: input.gradeTemplateId?.trim() || null,
      behaviouralTemplateId: input.behaviouralTemplateId?.trim() || null,
      behaviouralGradingTemplateId: input.behaviouralGradingTemplateId?.trim() || null,
    };
    if (!payload.classId || !payload.templateId || !payload.sessionId || !payload.termId) {
      throw new Error("classId, templateId, sessionId, and termId are required");
    }
    await this.assertRefs(payload);
    try {
      return await this.prisma.classAssessmentTemplate.create({ data: payload, include });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("This class already has this assessment template for the session and term");
      }
      throw e;
    }
  }

  async list(params: {
    classId?: string;
    templateId?: string;
    sessionId?: string;
    termId?: string;
    gradeTemplateId?: string;
    behaviouralTemplateId?: string;
    behaviouralGradingTemplateId?: string;
  }) {
    const where: Prisma.ClassAssessmentTemplateWhereInput = {};
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.templateId?.trim()) where.templateId = params.templateId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.gradeTemplateId?.trim()) where.gradeTemplateId = params.gradeTemplateId.trim();
    if (params.behaviouralTemplateId?.trim()) {
      where.behaviouralTemplateId = params.behaviouralTemplateId.trim();
    }
    if (params.behaviouralGradingTemplateId?.trim()) {
      where.behaviouralGradingTemplateId = params.behaviouralGradingTemplateId.trim();
    }

    const rows = await this.prisma.classAssessmentTemplate.findMany({
      where,
      include,
      orderBy: [{ sessionId: "desc" }, { termId: "asc" }, { classId: "asc" }],
    });
    return { classAssessmentTemplates: rows, count: rows.length };
  }

  async getById(id: string): Promise<ClassAssessmentTemplateData | null> {
    return this.prisma.classAssessmentTemplate.findUnique({ where: { id }, include });
  }

  async getLatestByClassId(classId: string): Promise<ClassAssessmentTemplateData | null> {
    try {
      const latest = await this.prisma.classAssessmentTemplate.findFirst({
        where: { classId },
        orderBy: [{ createdAt: "desc" }],
      });
      if (!latest) return null;
      return latest as ClassAssessmentTemplateData;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Class assessment template not found");
      }
      throw e;
    }
  }
  async getOrCreateClassTemplate(params: {
    classId: string;
    sessionId: string;
    termId: string;
  }): Promise<ClassAssessmentTemplateData> {
    if (!params.classId || !params.sessionId || !params.termId) {
      throw new Error("classId, sessionId, and termId are required");
    }
    const [cls, session, term] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: params.classId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: params.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: params.termId }, select: { id: true } }),
    ]);
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    const existing = await this.list({
      classId: params.classId,
      sessionId: params.sessionId,
      termId: params.termId,
    });
    if (existing.classAssessmentTemplates.length > 0)
      return existing.classAssessmentTemplates[0] as ClassAssessmentTemplateData;

    const latest = await this.getLatestByClassId(params.classId);
    if (!latest) throw new Error("Assessment template not found for this class");
    return this.create({
      classId: params.classId,
      templateId: latest.templateId,
      gradeTemplateId: latest.gradeTemplateId,
      behaviouralTemplateId: latest.behaviouralTemplateId,
      behaviouralGradingTemplateId: latest.behaviouralGradingTemplateId,
      sessionId: params.sessionId,
      termId: params.termId,
    });
  }

  async update(
    id: string,
    input: {
      templateId?: string;
      gradeTemplateId?: string | null;
      behaviouralTemplateId?: string | null;
      behaviouralGradingTemplateId?: string | null;
    }
  ): Promise<ClassAssessmentTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Class assessment template not found");

    if (
      input.templateId === undefined &&
      input.gradeTemplateId === undefined &&
      input.behaviouralTemplateId === undefined &&
      input.behaviouralGradingTemplateId === undefined
    ) {
      throw new Error(
        "At least one of templateId, gradeTemplateId, behaviouralTemplateId, or behaviouralGradingTemplateId must be provided"
      );
    }

    const templateId =
      input.templateId !== undefined ? input.templateId.trim() : existing.templateId;
    const gradeTemplateId =
      input.gradeTemplateId !== undefined
        ? input.gradeTemplateId?.trim() || null
        : existing.gradeTemplateId;
    const behaviouralTemplateId =
      input.behaviouralTemplateId !== undefined
        ? input.behaviouralTemplateId?.trim() || null
        : existing.behaviouralTemplateId;
    const behaviouralGradingTemplateId =
      input.behaviouralGradingTemplateId !== undefined
        ? input.behaviouralGradingTemplateId?.trim() || null
        : existing.behaviouralGradingTemplateId;

    if (input.templateId !== undefined && !templateId) {
      throw new Error("templateId must be a non-empty string");
    }

    await this.assertRefs({
      classId: existing.classId,
      templateId,
      sessionId: existing.sessionId,
      termId: existing.termId,
      gradeTemplateId,
      behaviouralTemplateId,
      behaviouralGradingTemplateId,
    });

    try {
      return await this.prisma.classAssessmentTemplate.update({
        where: { id },
        data: {
          ...(input.templateId !== undefined ? { templateId } : {}),
          ...(input.gradeTemplateId !== undefined ? { gradeTemplateId } : {}),
          ...(input.behaviouralTemplateId !== undefined ? { behaviouralTemplateId } : {}),
          ...(input.behaviouralGradingTemplateId !== undefined
            ? { behaviouralGradingTemplateId }
            : {}),
        },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Class assessment template not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("This class already has this assessment template for the session and term");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<ClassAssessmentTemplateData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Class assessment template not found");
    try {
      return await this.prisma.classAssessmentTemplate.delete({ where: { id }, include });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Class assessment template not found");
      }
      throw e;
    }
  }
}

export const classAssessmentTemplateService = new ClassAssessmentTemplateService();
