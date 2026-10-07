import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  student: {
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true },
  },
  class: { select: { id: true, name: true, status: true } },
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
} satisfies Prisma.AssessmentRemarksInclude;

type Row = Prisma.AssessmentRemarksGetPayload<{ include: typeof include }>;

export interface AssessmentRemarksData {
  id: string;
  studentId: string;
  student: Row["student"];
  classId: string;
  class: Row["class"];
  sessionId: string | null;
  session: Row["session"];
  termId: string | null;
  term: Row["term"];
  teacherRemark: string | null;
  parentRemark: string | null;
  principalRemark: string | null;
  headTeacherRemark: string | null;
  classTeacherRemark: string | null;
  otherRemark: string | null;
}

function mapRow(row: Row): AssessmentRemarksData {
  return {
    id: row.id,
    studentId: row.studentId,
    student: row.student,
    classId: row.classId,
    class: row.class,
    sessionId: row.sessionId,
    session: row.session,
    termId: row.termId,
    term: row.term,
    teacherRemark: row.teacherRemark,
    parentRemark: row.parentRemark,
    principalRemark: row.principalRemark,
    headTeacherRemark: row.headTeacherRemark,
    classTeacherRemark: row.classTeacherRemark,
    otherRemark: row.otherRemark,
  };
}

function trimRemark(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export class AssessmentRemarksService {
  private prisma = prisma;

  private async assertRefs(input: {
    studentId: string;
    classId: string;
    sessionId?: string | null;
    termId?: string | null;
  }): Promise<void> {
    const [student, cls] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, classId: true },
      }),
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
    ]);
    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (student.classId !== input.classId) {
      throw new Error("studentId does not belong to the specified classId");
    }
    if (input.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: input.sessionId },
        select: { id: true },
      });
      if (!session) throw new Error("Invalid sessionId");
    }
    if (input.termId) {
      const term = await this.prisma.term.findUnique({
        where: { id: input.termId },
        select: { id: true },
      });
      if (!term) throw new Error("Invalid termId");
    }
  }

  private async assertNotDuplicate(
    input: {
      studentId: string;
      classId: string;
      sessionId: string | null;
    },
    excludeId?: string
  ): Promise<void> {
    const existing = await this.prisma.assessmentRemarks.findFirst({
      where: {
        studentId: input.studentId,
        classId: input.classId,
        sessionId: input.sessionId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Assessment remarks already exist for this student, class, and session");
    }
  }

  async create(input: {
    studentId: string;
    classId: string;
    sessionId?: string | null;
    termId?: string | null;
    teacherRemark?: string | null;
    parentRemark?: string | null;
    principalRemark?: string | null;
    headTeacherRemark?: string | null;
    classTeacherRemark?: string | null;
    otherRemark?: string | null;
  }): Promise<{ assessmentRemarks: AssessmentRemarksData; created: boolean }> {
    const studentId = input.studentId.trim();
    const classId = input.classId.trim();
    const sessionId = input.sessionId?.trim() || null;
    const termId = input.termId?.trim() || null;
    if (!studentId) throw new Error("studentId is required");
    if (!classId) throw new Error("classId is required");

    await this.assertRefs({ studentId, classId, sessionId, termId });

    const remarkData = {
      termId,
      teacherRemark: trimRemark(input.teacherRemark),
      parentRemark: trimRemark(input.parentRemark),
      principalRemark: trimRemark(input.principalRemark),
      headTeacherRemark: trimRemark(input.headTeacherRemark),
      classTeacherRemark: trimRemark(input.classTeacherRemark),
      otherRemark: trimRemark(input.otherRemark),
    };

    const existing = await this.prisma.assessmentRemarks.findFirst({
      where: { studentId, classId, sessionId },
      select: { id: true },
    });

    try {
      const row = existing
        ? await this.prisma.assessmentRemarks.update({
            where: { id: existing.id },
            data: remarkData,
            include,
          })
        : await this.prisma.assessmentRemarks.create({
            data: {
              studentId,
              classId,
              sessionId,
              ...remarkData,
            },
            include,
          });

      return { assessmentRemarks: mapRow(row), created: !existing };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Assessment remarks already exist for this student, class, and session");
      }
      throw e;
    }
  }

  async list(params: {
    studentId?: string;
    classId?: string;
    sessionId?: string;
    termId?: string;
  }) {
    const where: Prisma.AssessmentRemarksWhereInput = {};
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();

    const rows = await this.prisma.assessmentRemarks.findMany({
      where,
      include,
      orderBy: [{ sessionId: "desc" }, { termId: "asc" }, { studentId: "asc" }],
    });
    return { assessmentRemarks: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<AssessmentRemarksData | null> {
    const row = await this.prisma.assessmentRemarks.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      teacherRemark?: string | null;
      parentRemark?: string | null;
      principalRemark?: string | null;
      headTeacherRemark?: string | null;
      classTeacherRemark?: string | null;
      otherRemark?: string | null;
      sessionId?: string | null;
      termId?: string | null;
    }
  ): Promise<AssessmentRemarksData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment remarks not found");

    const sessionId =
      input.sessionId !== undefined ? input.sessionId?.trim() || null : existing.sessionId;
    const termId = input.termId !== undefined ? input.termId?.trim() || null : existing.termId;

    await this.assertRefs({
      studentId: existing.studentId,
      classId: existing.classId,
      sessionId,
      termId,
    });
    if (input.sessionId !== undefined) {
      await this.assertNotDuplicate(
        {
          studentId: existing.studentId,
          classId: existing.classId,
          sessionId,
        },
        id
      );
    }

    try {
      const row = await this.prisma.assessmentRemarks.update({
        where: { id },
        data: {
          ...(input.sessionId !== undefined ? { sessionId } : {}),
          ...(input.termId !== undefined ? { termId } : {}),
          ...(input.teacherRemark !== undefined ? { teacherRemark: trimRemark(input.teacherRemark) } : {}),
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
        throw new Error("Assessment remarks not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AssessmentRemarksData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assessment remarks not found");
    try {
      const row = await this.prisma.assessmentRemarks.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assessment remarks not found");
      }
      throw e;
    }
  }
}

export const assessmentRemarksService = new AssessmentRemarksService();
