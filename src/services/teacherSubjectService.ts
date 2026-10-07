import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  staff: {
    select: { id: true, StaffNumber: true, name: true, email: true, userId: true },
  },
  subject: { select: { id: true, code: true, name: true, status: true } },
  class: { select: { id: true, name: true } },
  subclass: { select: { id: true, name: true, classId: true } },
  session: { select: { id: true, name: true } },
  term: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.TeacherSubjectsInclude;

export type TeacherSubjectData = Prisma.TeacherSubjectsGetPayload<{ include: typeof include }>;

export class TeacherSubjectService {
  private prisma = prisma;

  private async assertRefs(input: {
    staffId: string;
    subjectId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    userId?: string | null;
  }): Promise<{ userId: string | null }> {
    const subclassId = input.subclassId?.trim() || null;

    const [staff, subject, cls, session, term] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: input.staffId },
        select: { id: true, userId: true },
      }),
      this.prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);

    if (!staff) throw new Error("Invalid staffId");
    if (!subject) throw new Error("Invalid subjectId");
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");

    if (subclassId) {
      const subclass = await this.prisma.subClass.findUnique({
        where: { id: subclassId },
        select: { id: true, classId: true },
      });
      if (!subclass) throw new Error("Invalid subclassId");
      if (subclass.classId && subclass.classId !== input.classId) {
        throw new Error("subclassId does not belong to classId");
      }
    }

    let userId = input.userId?.trim() || null;
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new Error("Invalid userId");
    } else {
      userId = staff.userId;
    }

    return { userId };
  }

  async create(input: {
    staffId: string;
    subjectId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    userId?: string | null;
  }): Promise<TeacherSubjectData> {
    const staffId = input.staffId.trim();
    const subjectId = input.subjectId.trim();
    const classId = input.classId.trim();
    const subclassId = input.subclassId?.trim() || null;
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();

    if (!staffId || !subjectId || !classId || !sessionId || !termId) {
      throw new Error("staffId, subjectId, classId, sessionId, and termId are required");
    }

    const { userId } = await this.assertRefs({
      staffId,
      subjectId,
      classId,
      subclassId,
      sessionId,
      termId,
      userId: input.userId,
    });

    try {
      return await this.prisma.teacherSubjects.create({
        data: {
          staffId,
          subjectId,
          classId,
          subclassId,
          sessionId,
          termId,
          userId,
        },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Teacher subject assignment already exists");
      }
      throw e;
    }
  }

  async createMany(input: {
    staffId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    userId?: string | null;
    subjectIds: string[];
  }): Promise<{ teacherSubjects: TeacherSubjectData[]; count: number }> {
    const staffId = input.staffId.trim();
    const classId = input.classId.trim();
    const subclassId = input.subclassId?.trim() || null;
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();

    if (!staffId || !classId || !sessionId || !termId) {
      throw new Error("staffId, classId, sessionId, and termId are required");
    }
    if (!Array.isArray(input.subjectIds) || input.subjectIds.length === 0) {
      throw new Error("subjectIds must be a non-empty array");
    }

    const subjectIds = input.subjectIds.map((id) => {
      if (typeof id !== "string" || !id.trim()) {
        throw new Error("Each subjectId must be a non-empty string");
      }
      return id.trim();
    });

    const uniqueSubjectIds = [...new Set(subjectIds)];
    if (uniqueSubjectIds.length !== subjectIds.length) {
      throw new Error("Duplicate subjects in request");
    }

    const { userId } = await this.assertRefs({
      staffId,
      subjectId: uniqueSubjectIds[0],
      classId,
      subclassId,
      sessionId,
      termId,
      userId: input.userId,
    });

    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: uniqueSubjectIds } },
      select: { id: true },
    });
    if (subjects.length !== uniqueSubjectIds.length) {
      throw new Error("Invalid subjectId");
    }

    const rows = await this.prisma.$transaction(
      uniqueSubjectIds.map((subjectId) =>
        this.prisma.teacherSubjects.create({
          data: {
            staffId,
            subjectId,
            classId,
            subclassId,
            sessionId,
            termId,
            userId,
          },
          include,
        })
      )
    );

    return { teacherSubjects: rows, count: rows.length };
  }

  async list(params: {
    staffId?: string;
    subjectId?: string;
    classId?: string;
    subclassId?: string;
    sessionId?: string;
    termId?: string;
    userId?: string;
  }): Promise<{ teacherSubjects: TeacherSubjectData[]; count: number }> {
    const where: Prisma.TeacherSubjectsWhereInput = {};
    if (params.staffId?.trim()) where.staffId = params.staffId.trim();
    if (params.subjectId?.trim()) where.subjectId = params.subjectId.trim();
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subclassId?.trim()) where.subclassId = params.subclassId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.userId?.trim()) where.userId = params.userId.trim();

    const teacherSubjects = await this.prisma.teacherSubjects.findMany({
      where,
      include,
      orderBy: [
        { sessionId: "desc" },
        { termId: "asc" },
        { classId: "asc" },
        { subclassId: "asc" },
        { staff: { name: "asc" } },
        { subject: { code: "asc" } },
      ],
    });

    return { teacherSubjects, count: teacherSubjects.length };
  }

  async getById(id: string): Promise<TeacherSubjectData | null> {
    return this.prisma.teacherSubjects.findUnique({ where: { id }, include });
  }

  async update(
    id: string,
    input: {
      staffId?: string;
      subjectId?: string;
      classId?: string;
      subclassId?: string | null;
      sessionId?: string;
      termId?: string;
      userId?: string | null;
    }
  ): Promise<TeacherSubjectData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Teacher subject not found");

    const payload = {
      staffId: (input.staffId ?? existing.staffId).trim(),
      subjectId: (input.subjectId ?? existing.subjectId).trim(),
      classId: (input.classId ?? existing.classId).trim(),
      subclassId:
        input.subclassId !== undefined ? input.subclassId?.trim() || null : existing.subclassId,
      sessionId: (input.sessionId ?? existing.sessionId).trim(),
      termId: (input.termId ?? existing.termId).trim(),
      userId: input.userId !== undefined ? input.userId?.trim() || null : existing.userId,
    };

    const { userId } = await this.assertRefs(payload);

    try {
      return await this.prisma.teacherSubjects.update({
        where: { id },
        data: {
          ...(input.staffId !== undefined ? { staffId: payload.staffId } : {}),
          ...(input.subjectId !== undefined ? { subjectId: payload.subjectId } : {}),
          ...(input.classId !== undefined ? { classId: payload.classId } : {}),
          ...(input.subclassId !== undefined ? { subclassId: payload.subclassId } : {}),
          ...(input.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
          ...(input.termId !== undefined ? { termId: payload.termId } : {}),
          ...(input.userId !== undefined || input.staffId !== undefined ? { userId } : {}),
          updatedAt: new Date(),
        },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Teacher subject not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Teacher subject assignment already exists");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<TeacherSubjectData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Teacher subject not found");
    try {
      return await this.prisma.teacherSubjects.delete({ where: { id }, include });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Teacher subject not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: teacher subject is referenced by other records");
      }
      throw e;
    }
  }
}

export const teacherSubjectService = new TeacherSubjectService();
