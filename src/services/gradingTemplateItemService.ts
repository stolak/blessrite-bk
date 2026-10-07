import prisma from "../utils/prisma";
import {
  isPrismaKnownErrorWithCode,
  parseDecimalNonNegative,
} from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  gradingTemplate: { select: { id: true, name: true, version: true, isLocked: true } },
} satisfies Prisma.GradingTemplateItemInclude;

export interface GradingTemplateItemData {
  id: string;
  gradingTemplateId: string;
  gradingTemplate: Prisma.GradingTemplateItemGetPayload<{ include: typeof include }>["gradingTemplate"];
  grade: string;
  minScore: string;
  maxScore: string;
  remark: string | null;
  gradePoint: string;
}

function mapRow(
  row: Prisma.GradingTemplateItemGetPayload<{ include: typeof include }>
): GradingTemplateItemData {
  return {
    id: row.id,
    gradingTemplateId: row.gradingTemplateId,
    gradingTemplate: row.gradingTemplate,
    grade: row.grade,
    minScore: row.minScore.toString(),
    maxScore: row.maxScore.toString(),
    remark: row.remark,
    gradePoint: row.gradePoint.toString(),
  };
}

export class GradingTemplateItemService {
  private prisma = prisma;

  private async assertTemplate(gradingTemplateId: string): Promise<{ isLocked: boolean }> {
    const row = await this.prisma.gradingTemplate.findUnique({
      where: { id: gradingTemplateId },
      select: { id: true, isLocked: true },
    });
    if (!row) throw new Error("Invalid gradingTemplateId");
    return row;
  }

  async create(input: {
    gradingTemplateId: string;
    grade: string;
    minScore: string | number;
    maxScore: string | number;
    remark?: string | null;
    gradePoint: string | number;
  }) {
    const gradingTemplateId = input.gradingTemplateId.trim();
    const grade = input.grade.trim();
    if (!gradingTemplateId) throw new Error("gradingTemplateId is required");
    if (!grade) throw new Error("grade is required");

    const template = await this.assertTemplate(gradingTemplateId);
    if (template.isLocked) throw new Error("Cannot add item: grading template is locked");

    const minScore = parseDecimalNonNegative(input.minScore, "minScore");
    const maxScore = parseDecimalNonNegative(input.maxScore, "maxScore");
    if (minScore.gt(maxScore)) throw new Error("minScore cannot be greater than maxScore");

    try {
      const row = await this.prisma.gradingTemplateItem.create({
        data: {
          gradingTemplateId,
          grade,
          minScore,
          maxScore,
          gradePoint: parseDecimalNonNegative(input.gradePoint, "gradePoint"),
          remark: input.remark?.trim() || null,
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("This grade already exists on the grading template");
      }
      throw e;
    }
  }

  async list(params: { gradingTemplateId?: string; grade?: string }) {
    const where: Prisma.GradingTemplateItemWhereInput = {};
    if (params.gradingTemplateId?.trim()) where.gradingTemplateId = params.gradingTemplateId.trim();
    if (params.grade?.trim()) where.grade = params.grade.trim();

    const rows = await this.prisma.gradingTemplateItem.findMany({
      where,
      include,
      orderBy: [{ gradingTemplateId: "asc" }, { minScore: "desc" }],
    });
    return { gradingTemplateItems: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string) {
    const row = await this.prisma.gradingTemplateItem.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      grade?: string;
      minScore?: string | number;
      maxScore?: string | number;
      remark?: string | null;
      gradePoint?: string | number;
    }
  ) {
    const existing = await this.prisma.gradingTemplateItem.findUnique({
      where: { id },
      include,
    });
    if (!existing) throw new Error("Grading template item not found");
    if (existing.gradingTemplate.isLocked) {
      throw new Error("Cannot update item: grading template is locked");
    }

    const minScore =
      input.minScore !== undefined
        ? parseDecimalNonNegative(input.minScore, "minScore")
        : existing.minScore;
    const maxScore =
      input.maxScore !== undefined
        ? parseDecimalNonNegative(input.maxScore, "maxScore")
        : existing.maxScore;
    if (minScore.gt(maxScore)) throw new Error("minScore cannot be greater than maxScore");

    try {
      const row = await this.prisma.gradingTemplateItem.update({
        where: { id },
        data: {
          ...(input.grade !== undefined ? { grade: input.grade.trim() } : {}),
          ...(input.minScore !== undefined ? { minScore } : {}),
          ...(input.maxScore !== undefined ? { maxScore } : {}),
          ...(input.gradePoint !== undefined
            ? { gradePoint: parseDecimalNonNegative(input.gradePoint, "gradePoint") }
            : {}),
          ...(input.remark !== undefined ? { remark: input.remark?.trim() || null } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Grading template item not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("This grade already exists on the grading template");
      }
      throw e;
    }
  }

  async delete(id: string) {
    const existing = await this.prisma.gradingTemplateItem.findUnique({
      where: { id },
      include,
    });
    if (!existing) throw new Error("Grading template item not found");
    if (existing.gradingTemplate.isLocked) {
      throw new Error("Cannot delete item: grading template is locked");
    }
    try {
      const row = await this.prisma.gradingTemplateItem.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Grading template item not found");
      }
      throw e;
    }
  }
}

export const gradingTemplateItemService = new GradingTemplateItemService();
