import prisma from "../utils/prisma";
import {
  isPrismaKnownErrorWithCode,
  parseDecimalNonNegative,
} from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  behaviouralGradingTemplate: {
    select: { id: true, name: true, version: true, isLocked: true, status: true },
  },
} satisfies Prisma.BehaviouralGradingItemInclude;

type Row = Prisma.BehaviouralGradingItemGetPayload<{ include: typeof include }>;

export interface BehaviouralGradingItemData {
  id: string;
  behaviouralGradingTemplateId: string;
  behaviouralGradingTemplate: NonNullable<Row["behaviouralGradingTemplate"]>;
  grade: string;
  lowBoundary: string;
  highBoundary: string;
  remark: string | null;
  gradePoint: string;
}

function mapRow(row: Row): BehaviouralGradingItemData {
  if (!row.behaviouralGradingTemplateId || !row.behaviouralGradingTemplate) {
    throw new Error("Behavioural grading item is missing template reference");
  }
  return {
    id: row.id,
    behaviouralGradingTemplateId: row.behaviouralGradingTemplateId,
    behaviouralGradingTemplate: row.behaviouralGradingTemplate,
    grade: row.grade,
    lowBoundary: row.lowBoundary.toString(),
    highBoundary: row.highBoundary.toString(),
    remark: row.remark,
    gradePoint: row.gradePoint.toString(),
  };
}

export class BehaviouralGradingItemService {
  private prisma = prisma;

  private async assertTemplate(
    behaviouralGradingTemplateId: string
  ): Promise<{ isLocked: boolean }> {
    const row = await this.prisma.behaviouralGradingTemplate.findUnique({
      where: { id: behaviouralGradingTemplateId },
      select: { id: true, isLocked: true },
    });
    if (!row) throw new Error("Invalid behaviouralGradingTemplateId");
    return row;
  }

  async create(input: {
    behaviouralGradingTemplateId: string;
    grade: string;
    lowBoundary: string | number;
    highBoundary: string | number;
    remark?: string | null;
    gradePoint: string | number;
  }): Promise<BehaviouralGradingItemData> {
    const behaviouralGradingTemplateId = input.behaviouralGradingTemplateId.trim();
    const grade = input.grade.trim();
    if (!behaviouralGradingTemplateId) throw new Error("behaviouralGradingTemplateId is required");
    if (!grade) throw new Error("grade is required");

    const template = await this.assertTemplate(behaviouralGradingTemplateId);
    if (template.isLocked) throw new Error("Cannot add item: behavioural grading template is locked");

    const lowBoundary = parseDecimalNonNegative(input.lowBoundary, "lowBoundary");
    const highBoundary = parseDecimalNonNegative(input.highBoundary, "highBoundary");
    if (lowBoundary.gt(highBoundary)) {
      throw new Error("lowBoundary cannot be greater than highBoundary");
    }

    const row = await this.prisma.behaviouralGradingItem.create({
      data: {
        behaviouralGradingTemplateId,
        grade,
        lowBoundary,
        highBoundary,
        gradePoint: parseDecimalNonNegative(input.gradePoint, "gradePoint"),
        remark: input.remark?.trim() || null,
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: { behaviouralGradingTemplateId?: string; grade?: string }) {
    const where: Prisma.BehaviouralGradingItemWhereInput = {};
    if (params.behaviouralGradingTemplateId?.trim()) {
      where.behaviouralGradingTemplateId = params.behaviouralGradingTemplateId.trim();
    }
    if (params.grade?.trim()) where.grade = params.grade.trim();

    const rows = await this.prisma.behaviouralGradingItem.findMany({
      where,
      include,
      orderBy: [{ behaviouralGradingTemplateId: "asc" }, { lowBoundary: "desc" }],
    });
    return { behaviouralGradingItems: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<BehaviouralGradingItemData | null> {
    const row = await this.prisma.behaviouralGradingItem.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      grade?: string;
      lowBoundary?: string | number;
      highBoundary?: string | number;
      remark?: string | null;
      gradePoint?: string | number;
    }
  ): Promise<BehaviouralGradingItemData> {
    const existing = await this.prisma.behaviouralGradingItem.findUnique({ where: { id }, include });
    if (!existing) throw new Error("Behavioural grading item not found");
    if (existing.behaviouralGradingTemplate?.isLocked) {
      throw new Error("Cannot update item: behavioural grading template is locked");
    }

    const lowBoundary =
      input.lowBoundary !== undefined
        ? parseDecimalNonNegative(input.lowBoundary, "lowBoundary")
        : existing.lowBoundary;
    const highBoundary =
      input.highBoundary !== undefined
        ? parseDecimalNonNegative(input.highBoundary, "highBoundary")
        : existing.highBoundary;
    if (lowBoundary.gt(highBoundary)) {
      throw new Error("lowBoundary cannot be greater than highBoundary");
    }

    try {
      const row = await this.prisma.behaviouralGradingItem.update({
        where: { id },
        data: {
          ...(input.grade !== undefined ? { grade: input.grade.trim() } : {}),
          ...(input.lowBoundary !== undefined ? { lowBoundary } : {}),
          ...(input.highBoundary !== undefined ? { highBoundary } : {}),
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
        throw new Error("Behavioural grading item not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<BehaviouralGradingItemData> {
    const existing = await this.prisma.behaviouralGradingItem.findUnique({ where: { id }, include });
    if (!existing) throw new Error("Behavioural grading item not found");
    if (existing.behaviouralGradingTemplate?.isLocked) {
      throw new Error("Cannot delete item: behavioural grading template is locked");
    }
    try {
      const row = await this.prisma.behaviouralGradingItem.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural grading item not found");
      }
      throw e;
    }
  }
}

export const behaviouralGradingItemService = new BehaviouralGradingItemService();
