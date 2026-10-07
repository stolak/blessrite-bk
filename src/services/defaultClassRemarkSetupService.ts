import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  class: { select: { id: true, name: true, status: true } },
} satisfies Prisma.DefaultClassRemarkSetupInclude;

type Row = Prisma.DefaultClassRemarkSetupGetPayload<{ include: typeof include }>;

export interface DefaultClassRemarkSetupData {
  id: string;
  classId: string;
  class: Row["class"];
  teacherRemark: string;
  parentRemark: string | null;
  principalRemark: string | null;
  headTeacherRemark: string | null;
  classTeacherRemark: string | null;
  otherRemark: string | null;
  lowerBoundary: string;
  upperBoundary: string;
}

function mapRow(row: Row): DefaultClassRemarkSetupData {
  return {
    id: row.id,
    classId: row.classId,
    class: row.class,
    teacherRemark: row.teacherRemark,
    parentRemark: row.parentRemark,
    principalRemark: row.principalRemark,
    headTeacherRemark: row.headTeacherRemark,
    classTeacherRemark: row.classTeacherRemark,
    otherRemark: row.otherRemark,
    lowerBoundary: row.lowerBoundary.toString(),
    upperBoundary: row.upperBoundary.toString(),
  };
}

function trimRemark(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function boundaryRangesOverlap(
  lowerA: Prisma.Decimal,
  upperA: Prisma.Decimal,
  lowerB: Prisma.Decimal,
  upperB: Prisma.Decimal
): boolean {
  return !upperA.lessThan(lowerB) && !upperB.lessThan(lowerA);
}

export class DefaultClassRemarkSetupService {
  private prisma = prisma;

  private async assertClass(classId: string): Promise<void> {
    const cls = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!cls) throw new Error("Invalid classId");
  }

  private async assertNoBoundaryOverlap(
    classId: string,
    lowerBoundary: Prisma.Decimal,
    upperBoundary: Prisma.Decimal,
    excludeId?: string
  ): Promise<void> {
    const existing = await this.prisma.defaultClassRemarkSetup.findMany({
      where: {
        classId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { lowerBoundary: true, upperBoundary: true },
    });
    for (const row of existing) {
      if (boundaryRangesOverlap(lowerBoundary, upperBoundary, row.lowerBoundary, row.upperBoundary)) {
        throw new Error("An overlapping boundary range already exists for this class");
      }
    }
  }

  async create(input: {
    classId: string;
    teacherRemark: string;
    lowerBoundary: string | number;
    upperBoundary: string | number;
    parentRemark?: string | null;
    principalRemark?: string | null;
    headTeacherRemark?: string | null;
    classTeacherRemark?: string | null;
    otherRemark?: string | null;
  }): Promise<{ defaultClassRemarkSetup: DefaultClassRemarkSetupData; created: boolean }> {
    const classId = input.classId.trim();
    const teacherRemark = input.teacherRemark.trim();
    if (!classId) throw new Error("classId is required");
    if (!teacherRemark) throw new Error("teacherRemark is required");

    const lowerBoundary = parseDecimalNonNegative(input.lowerBoundary, "lowerBoundary");
    const upperBoundary = parseDecimalNonNegative(input.upperBoundary, "upperBoundary");
    if (lowerBoundary.gt(upperBoundary)) {
      throw new Error("lowerBoundary cannot be greater than upperBoundary");
    }

    await this.assertClass(classId);

    const existing = await this.prisma.defaultClassRemarkSetup.findUnique({
      where: {
        classId_lowerBoundary_upperBoundary: { classId, lowerBoundary, upperBoundary },
      },
      select: { id: true },
    });

    if (existing) {
      await this.assertNoBoundaryOverlap(classId, lowerBoundary, upperBoundary, existing.id);
      const row = await this.prisma.defaultClassRemarkSetup.update({
        where: { id: existing.id },
        data: {
          teacherRemark,
          parentRemark: trimRemark(input.parentRemark),
          principalRemark: trimRemark(input.principalRemark),
          headTeacherRemark: trimRemark(input.headTeacherRemark),
          classTeacherRemark: trimRemark(input.classTeacherRemark),
          otherRemark: trimRemark(input.otherRemark),
        },
        include,
      });
      return { defaultClassRemarkSetup: mapRow(row), created: false };
    }

    await this.assertNoBoundaryOverlap(classId, lowerBoundary, upperBoundary);

    const row = await this.prisma.defaultClassRemarkSetup.create({
      data: {
        classId,
        teacherRemark,
        lowerBoundary,
        upperBoundary,
        parentRemark: trimRemark(input.parentRemark),
        principalRemark: trimRemark(input.principalRemark),
        headTeacherRemark: trimRemark(input.headTeacherRemark),
        classTeacherRemark: trimRemark(input.classTeacherRemark),
        otherRemark: trimRemark(input.otherRemark),
      },
      include,
    });
    return { defaultClassRemarkSetup: mapRow(row), created: true };
  }

  async list(params: { classId?: string }) {
    const where: Prisma.DefaultClassRemarkSetupWhereInput = {};
    if (params.classId?.trim()) where.classId = params.classId.trim();

    const rows = await this.prisma.defaultClassRemarkSetup.findMany({
      where,
      include,
      orderBy: [{ classId: "asc" }, { lowerBoundary: "desc" }],
    });
    return { defaultClassRemarkSetups: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<DefaultClassRemarkSetupData | null> {
    const row = await this.prisma.defaultClassRemarkSetup.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      teacherRemark?: string;
      lowerBoundary?: string | number;
      upperBoundary?: string | number;
      parentRemark?: string | null;
      principalRemark?: string | null;
      headTeacherRemark?: string | null;
      classTeacherRemark?: string | null;
      otherRemark?: string | null;
    }
  ): Promise<DefaultClassRemarkSetupData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Default class remark setup not found");

    const lowerBoundary =
      input.lowerBoundary !== undefined
        ? parseDecimalNonNegative(input.lowerBoundary, "lowerBoundary")
        : new Prisma.Decimal(existing.lowerBoundary);
    const upperBoundary =
      input.upperBoundary !== undefined
        ? parseDecimalNonNegative(input.upperBoundary, "upperBoundary")
        : new Prisma.Decimal(existing.upperBoundary);
    if (lowerBoundary.gt(upperBoundary)) {
      throw new Error("lowerBoundary cannot be greater than upperBoundary");
    }

    await this.assertNoBoundaryOverlap(existing.classId, lowerBoundary, upperBoundary, id);

    try {
      const row = await this.prisma.defaultClassRemarkSetup.update({
        where: { id },
        data: {
          ...(input.teacherRemark !== undefined ? { teacherRemark: input.teacherRemark.trim() } : {}),
          ...(input.lowerBoundary !== undefined ? { lowerBoundary } : {}),
          ...(input.upperBoundary !== undefined ? { upperBoundary } : {}),
          ...(input.parentRemark !== undefined ? { parentRemark: trimRemark(input.parentRemark) } : {}),
          ...(input.principalRemark !== undefined
            ? { principalRemark: trimRemark(input.principalRemark) }
            : {}),
          ...(input.headTeacherRemark !== undefined
            ? { headTeacherRemark: trimRemark(input.headTeacherRemark) }
            : {}),
          ...(input.classTeacherRemark !== undefined
            ? { classTeacherRemark: trimRemark(input.classTeacherRemark) }
            : {}),
          ...(input.otherRemark !== undefined ? { otherRemark: trimRemark(input.otherRemark) } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Default class remark setup not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<DefaultClassRemarkSetupData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Default class remark setup not found");
    try {
      const row = await this.prisma.defaultClassRemarkSetup.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Default class remark setup not found");
      }
      throw e;
    }
  }
}

export const defaultClassRemarkSetupService = new DefaultClassRemarkSetupService();
