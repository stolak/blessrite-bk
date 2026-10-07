import prisma from "../utils/prisma";
import {
  applyStatusFilter,
  isPrismaKnownErrorWithCode,
  parseDecimalNonNegative,
} from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  behaviourTemplate: { select: { id: true, name: true, status: true, version: true, isLocked: true } },
  _count: { select: { studentBehaviouralAssessmentScores: true } },
} satisfies Prisma.BehaviouralAssessmentComponentInclude;

type Row = Prisma.BehaviouralAssessmentComponentGetPayload<{ include: typeof include }>;

export interface BehaviouralAssessmentComponentData {
  id: string;
  behaviourTemplateId: string;
  behaviourTemplate: Row["behaviourTemplate"];
  name: string;
  maxScore: string;
  orderNo: number;
  status: Status;
  scoreCount: number;
}

function mapRow(row: Row): BehaviouralAssessmentComponentData {
  const { _count, ...rest } = row;
  return {
    id: rest.id,
    behaviourTemplateId: rest.behaviourTemplateId,
    behaviourTemplate: rest.behaviourTemplate,
    name: rest.name,
    maxScore: rest.maxScore.toString(),
    orderNo: rest.orderNo,
    status: rest.status,
    scoreCount: _count.studentBehaviouralAssessmentScores,
  };
}

export class BehaviouralAssessmentComponentService {
  private prisma = prisma;

  private async assertTemplate(behaviourTemplateId: string): Promise<{ isLocked: boolean }> {
    const row = await this.prisma.behaviouralAssessmentTemplate.findUnique({
      where: { id: behaviourTemplateId },
      select: { id: true, isLocked: true },
    });
    if (!row) throw new Error("Invalid behaviourTemplateId");
    return row;
  }

  async create(input: {
    behaviourTemplateId: string;
    name: string;
    maxScore?: string | number;
    orderNo: number;
    status?: Status;
  }): Promise<BehaviouralAssessmentComponentData> {
    const name = input.name.trim();
    const behaviourTemplateId = input.behaviourTemplateId.trim();
    if (!name) throw new Error("name is required");
    if (!behaviourTemplateId) throw new Error("behaviourTemplateId is required");

    const template = await this.assertTemplate(behaviourTemplateId);
    if (template.isLocked) throw new Error("Cannot add component: behavioural assessment template is locked");

    const row = await this.prisma.behaviouralAssessmentComponent.create({
      data: {
        behaviourTemplateId,
        name,
        maxScore:
          input.maxScore !== undefined
            ? parseDecimalNonNegative(input.maxScore, "maxScore")
            : new Prisma.Decimal(5),
        orderNo: input.orderNo,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include,
    });
    return mapRow(row);
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    behaviourTemplateId?: string;
  }) {
    const where: Prisma.BehaviouralAssessmentComponentWhereInput = {};
    applyStatusFilter(where, params.status);
    if (params.behaviourTemplateId?.trim()) {
      where.behaviourTemplateId = params.behaviourTemplateId.trim();
    }
    if (params.q?.trim()) where.name = { contains: params.q.trim() };

    const rows = await this.prisma.behaviouralAssessmentComponent.findMany({
      where,
      include,
      orderBy: [{ behaviourTemplateId: "asc" }, { orderNo: "asc" }, { name: "asc" }],
    });
    return { behaviouralAssessmentComponents: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<BehaviouralAssessmentComponentData | null> {
    const row = await this.prisma.behaviouralAssessmentComponent.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      behaviourTemplateId?: string;
      name?: string;
      maxScore?: string | number;
      orderNo?: number;
      status?: Status;
    }
  ): Promise<BehaviouralAssessmentComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural assessment component not found");
    if (existing.behaviourTemplate.isLocked) {
      throw new Error("Cannot update component: behavioural assessment template is locked");
    }
    if (input.behaviourTemplateId !== undefined) {
      const tid = input.behaviourTemplateId.trim();
      if (!tid) throw new Error("behaviourTemplateId cannot be empty");
      await this.assertTemplate(tid);
    }

    try {
      const row = await this.prisma.behaviouralAssessmentComponent.update({
        where: { id },
        data: {
          ...(input.behaviourTemplateId !== undefined
            ? { behaviourTemplateId: input.behaviourTemplateId.trim() }
            : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.maxScore !== undefined
            ? { maxScore: parseDecimalNonNegative(input.maxScore, "maxScore") }
            : {}),
          ...(input.orderNo !== undefined ? { orderNo: input.orderNo } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural assessment component not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<BehaviouralAssessmentComponentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Behavioural assessment component not found");
    if (existing.behaviourTemplate.isLocked) {
      throw new Error("Cannot delete component: behavioural assessment template is locked");
    }
    if (existing.scoreCount > 0) {
      throw new Error("Cannot delete: component has student scores");
    }
    try {
      const row = await this.prisma.behaviouralAssessmentComponent.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Behavioural assessment component not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: component is referenced by other records");
      }
      throw e;
    }
  }
}

export const behaviouralAssessmentComponentService = new BehaviouralAssessmentComponentService();
