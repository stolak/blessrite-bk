import prisma from "../utils/prisma";
import {
  applyStatusFilter,
  isPrismaKnownErrorWithCode,
  parseDecimalNonNegative,
} from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  template: { select: { id: true, name: true, status: true, versionId: true } },
  _count: { select: { scores: true } },
} satisfies Prisma.AssessmentComponentInclude;

type Row = Prisma.AssessmentComponentGetPayload<{ include: typeof include }>;

export interface AssessmentComponentData {
  id: string;
  templateId: string;
  template: Row["template"];
  name: string;
  shortName: string | null;
  maxScore: string;
  weight: string;
  orderNo: number;
  status: Status;
  isLocked: boolean;
  scoreCount: number;
}

function mapRow(row: Row): AssessmentComponentData {
  const { _count, ...rest } = row;
  return {
    id: rest.id,
    templateId: rest.templateId,
    template: rest.template,
    name: rest.name,
    shortName: rest.shortName,
    maxScore: rest.maxScore.toString(),
    weight: rest.weight.toString(),
    orderNo: rest.orderNo,
    status: rest.status,
    isLocked: rest.isLocked,
    scoreCount: _count.scores,
  };
}

export class AssessmentComponentService {
  private prisma = prisma;

  private async assertTemplateExists(templateId: string): Promise<void> {
    const row = await this.prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!row) throw new Error("Invalid templateId");
  }

  private async assertTemplateWeightWithinLimit(
    templateId: string,
    newWeight: Prisma.Decimal,
    excludeComponentId?: string
  ): Promise<void> {
    const where: Prisma.AssessmentComponentWhereInput = { templateId };
    if (excludeComponentId) where.id = { not: excludeComponentId };

    const agg = await this.prisma.assessmentComponent.aggregate({
      where,
      _sum: { weight: true },
    });

    const total = (agg._sum.weight ?? new Prisma.Decimal(0)).plus(newWeight);
    if (total.gt(100)) {
      throw new Error(
        `total component weight for template cannot exceed 100 (would be ${total.toString()})`
      );
    }
  }

  async create(input: {
    templateId: string;
    name: string;
    shortName?: string | null;
    maxScore: string | number;
    weight: string | number;
    orderNo: number;
    status?: Status;
    isLocked?: boolean;
  }): Promise<AssessmentComponentData> {
    const name = input.name.trim();
    const templateId = input.templateId.trim();
    if (!name) throw new Error("name is required");
    if (!templateId) throw new Error("templateId is required");
    await this.assertTemplateExists(templateId);

    const shortName =
      input.shortName === undefined || input.shortName === null || !String(input.shortName).trim()
        ? name
        : String(input.shortName).trim();

    const weight = parseDecimalNonNegative(input.weight, "weight");
    await this.assertTemplateWeightWithinLimit(templateId, weight);

    const row = await this.prisma.assessmentComponent.create({
      data: {
        templateId,
        name,
        shortName,
        maxScore: parseDecimalNonNegative(input.maxScore, "maxScore"),
        weight,
        orderNo: input.orderNo,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    templateId?: string;
    isLocked?: boolean;
  }) {
    const where: Prisma.AssessmentComponentWhereInput = {};
    applyStatusFilter(where, params.status);
    if (params.templateId?.trim()) where.templateId = params.templateId.trim();
    if (params.isLocked !== undefined) where.isLocked = params.isLocked;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { shortName: { contains: q } }];
    }

    const rows = await this.prisma.assessmentComponent.findMany({
      where,
      include,
      orderBy: [{ templateId: "asc" }, { orderNo: "asc" }, { name: "asc" }],
    });
    return { assessmentComponents: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<AssessmentComponentData | null> {
    const row = await this.prisma.assessmentComponent.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      templateId?: string;
      name?: string;
      shortName?: string | null;
      maxScore?: string | number;
      weight?: string | number;
      orderNo?: number;
      status?: Status;
      isLocked?: boolean;
    }
  ): Promise<AssessmentComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment component not found");
    if (
      existing.isLocked &&
      (input.maxScore !== undefined ||
        input.weight !== undefined ||
        input.orderNo !== undefined ||
        input.templateId !== undefined ||
        input.name !== undefined ||
        input.shortName !== undefined)
    ) {
      throw new Error("Component is locked; only status and isLocked may be changed");
    }
    if (input.templateId !== undefined) {
      const tid = input.templateId.trim();
      if (!tid) throw new Error("templateId cannot be empty");
      await this.assertTemplateExists(tid);
    }

    const effectiveTemplateId =
      input.templateId !== undefined ? input.templateId.trim() : existing.templateId;
    const effectiveWeight =
      input.weight !== undefined
        ? parseDecimalNonNegative(input.weight, "weight")
        : new Prisma.Decimal(existing.weight);

    if (input.weight !== undefined || input.templateId !== undefined) {
      await this.assertTemplateWeightWithinLimit(effectiveTemplateId, effectiveWeight, id);
    }

    const shortName =
      input.shortName === undefined
        ? undefined
        : input.shortName === null || !String(input.shortName).trim()
          ? null
          : String(input.shortName).trim();

    try {
      const row = await this.prisma.assessmentComponent.update({
        where: { id },
        data: {
          ...(input.templateId !== undefined ? { templateId: input.templateId.trim() } : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(shortName !== undefined ? { shortName } : {}),
          ...(input.maxScore !== undefined
            ? { maxScore: parseDecimalNonNegative(input.maxScore, "maxScore") }
            : {}),
          ...(input.weight !== undefined
            ? { weight: parseDecimalNonNegative(input.weight, "weight") }
            : {}),
          ...(input.orderNo !== undefined ? { orderNo: input.orderNo } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assessment component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AssessmentComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment component not found");
    if (existing.isLocked) throw new Error("Cannot delete: component is locked");
    if (existing.scoreCount > 0) throw new Error("Cannot delete: component has student scores");

    try {
      const row = await this.prisma.assessmentComponent.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assessment component not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: component is referenced by other records");
      }
      throw e;
    }
  }
}

export const assessmentComponentService = new AssessmentComponentService();
