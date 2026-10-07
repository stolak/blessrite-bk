import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  student: {
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true },
  },
  class: { select: { id: true, name: true } },
  subclass: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true, status: true } },
  session: { select: { id: true, name: true } },
  term: { select: { id: true, name: true } },
  _count: { select: { scores: true } },
} satisfies Prisma.StudentSubjectRegistrationInclude;

type Row = Prisma.StudentSubjectRegistrationGetPayload<{ include: typeof include }>;

export interface StudentSubjectRegistrationData extends Omit<Row, "_count"> {
  scoreCount: number;
}

function mapRow(row: Row): StudentSubjectRegistrationData {
  const { _count, ...rest } = row;
  return { ...rest, scoreCount: _count.scores };
}

export interface StudentSubjectRegistrationListItem {
  id: string;
  subjectId: string;
  subject: Row["subject"];
}

export interface StudentSubjectRegistrationGroup {
  id: string;
  studentId: string;
  student: Row["student"];
  classId: string;
  class: Row["class"];
  subclassId: string | null;
  subclass: Row["subclass"];
  sessionId: string;
  session: Row["session"];
  termId: string;
  term: Row["term"];
  subjects: StudentSubjectRegistrationListItem[];
}

export interface RegisteredSubjectSummary {
  id: string;
  code: string;
  name: string;
}

export class StudentSubjectRegistrationService {
  private prisma = prisma;

  private async assertRefs(input: {
    studentId: string;
    classId: string;
    subclassId?: string | null;
    subjectId: string;
    sessionId: string;
    termId: string;
  }): Promise<void> {
    const [student, cls, subject, session, term] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);
    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (!subject) throw new Error("Invalid subjectId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (input.subclassId) {
      const sub = await this.prisma.subClass.findUnique({
        where: { id: input.subclassId },
        select: { id: true, classId: true },
      });
      if (!sub) throw new Error("Invalid subclassId");
      if (sub.classId && sub.classId !== input.classId) {
        throw new Error("subclassId does not belong to classId");
      }
    }
  }

  private async assertStudentClassSessionTermRefs(input: {
    studentId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
  }): Promise<void> {
    const [student, cls, session, term] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);
    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (input.subclassId) {
      const sub = await this.prisma.subClass.findUnique({
        where: { id: input.subclassId },
        select: { id: true, classId: true },
      });
      if (!sub) throw new Error("Invalid subclassId");
      if (sub.classId && sub.classId !== input.classId) {
        throw new Error("subclassId does not belong to classId");
      }
    }
  }

  private async resolveSubjects(
    subjectIds: string[]
  ): Promise<Map<string, { id: string; name: string }>> {
    const uniqueIds = [...new Set(subjectIds)];
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    if (subjects.length !== uniqueIds.length) throw new Error("Invalid subjectId");
    return new Map(subjects.map((s) => [s.id, s]));
  }

  private duplicateNamesInList(
    subjectIds: string[],
    nameById: Map<string, { name: string }>
  ): string[] {
    const seen = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const id of subjectIds) {
      if (seen.has(id)) duplicateIds.add(id);
      seen.add(id);
    }
    return [...duplicateIds].map((id) => nameById.get(id)!.name);
  }

  private async assertSubjectsNotAlreadyRegistered(input: {
    studentId: string;
    classId: string;
    sessionId: string;
    termId: string;
    subjectIds: string[];
    nameById: Map<string, { name: string }>;
  }): Promise<void> {
    const existing = await this.prisma.studentSubjectRegistration.findMany({
      where: {
        studentId: input.studentId,
        classId: input.classId,
        sessionId: input.sessionId,
        termId: input.termId,
        subjectId: { in: [...new Set(input.subjectIds)] },
      },
      select: { subject: { select: { name: true } } },
    });
    if (existing.length === 0) return;

    const names = existing.map((row) => row.subject.name);
    throw new Error(
      `Student is already registered for subject${names.length > 1 ? "s" : ""}: ${names.join(", ")}`
    );
  }

  async create(input: {
    studentId: string;
    classId: string;
    subclassId?: string | null;
    subjectId: string;
    sessionId: string;
    termId: string;
  }): Promise<StudentSubjectRegistrationData> {
    const payload = {
      studentId: input.studentId.trim(),
      classId: input.classId.trim(),
      subclassId: input.subclassId?.trim() || null,
      subjectId: input.subjectId.trim(),
      sessionId: input.sessionId.trim(),
      termId: input.termId.trim(),
    };
    if (
      !payload.studentId ||
      !payload.classId ||
      !payload.subjectId ||
      !payload.sessionId ||
      !payload.termId
    ) {
      throw new Error("studentId, classId, subjectId, sessionId, and termId are required");
    }
    await this.assertRefs(payload);
    try {
      const row = await this.prisma.studentSubjectRegistration.create({ data: payload, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Student is already registered for this subject in the session and term");
      }
      throw e;
    }
  }

  async createMany(input: {
    studentId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    subjectIds: string[];
  }): Promise<{ studentSubjectRegistrations: StudentSubjectRegistrationData[]; count: number }> {
    const studentId = input.studentId.trim();
    const classId = input.classId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    const subclassId = input.subclassId?.trim() || null;

    if (!studentId || !classId || !sessionId || !termId) {
      throw new Error("studentId, classId, sessionId, and termId are required");
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

    await this.assertStudentClassSessionTermRefs({
      studentId,
      classId,
      subclassId,
      sessionId,
      termId,
    });
    const nameById = await this.resolveSubjects(subjectIds);

    const duplicateInRequest = this.duplicateNamesInList(subjectIds, nameById);
    if (duplicateInRequest.length > 0) {
      throw new Error(`Duplicate subjects in request: ${duplicateInRequest.join(", ")}`);
    }

    const uniqueSubjectIds = [...new Set(subjectIds)];
    await this.assertSubjectsNotAlreadyRegistered({
      studentId,
      classId,
      sessionId,
      termId,
      subjectIds: uniqueSubjectIds,
      nameById,
    });

    try {
      const rows = await this.prisma.$transaction(
        uniqueSubjectIds.map((subjectId) =>
          this.prisma.studentSubjectRegistration.create({
            data: { studentId, classId, subclassId, subjectId, sessionId, termId },
            include,
          })
        )
      );
      return { studentSubjectRegistrations: rows.map(mapRow), count: rows.length };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Student is already registered for this subject in the session and term");
      }
      throw e;
    }
  }

  private groupByStudentClassSubclassSessionAndTerm(
    rows: Row[]
  ): StudentSubjectRegistrationGroup[] {
    const map = new Map<string, StudentSubjectRegistrationGroup>();

    for (const row of rows) {
      const key = `${row.studentId}:${row.classId}:${row.subclassId ?? ""}:${row.sessionId}:${row.termId}`;
      let group = map.get(key);
      if (!group) {
        group = {
          id: row.id,
          studentId: row.studentId,
          student: row.student,
          classId: row.classId,
          class: row.class,
          subclassId: row.subclassId,
          subclass: row.subclass,
          sessionId: row.sessionId,
          session: row.session,
          termId: row.termId,
          term: row.term,
          subjects: [],
        };
        map.set(key, group);
      }
      group.subjects.push({
        id: row.id,
        subjectId: row.subjectId,
        subject: row.subject,
      });
    }

    return [...map.values()].sort((a, b) => {
      const bySession = b.session.name.localeCompare(a.session.name);
      if (bySession !== 0) return bySession;
      const byTerm = a.term.name.localeCompare(b.term.name);
      if (byTerm !== 0) return byTerm;
      const byStudent = a.student.lastName.localeCompare(b.student.lastName);
      if (byStudent !== 0) return byStudent;
      const byFirstName = a.student.firstName.localeCompare(b.student.firstName);
      if (byFirstName !== 0) return byFirstName;
      const byClass = a.class.name.localeCompare(b.class.name);
      if (byClass !== 0) return byClass;
      return (a.subclass?.name ?? "").localeCompare(b.subclass?.name ?? "");
    });
  }

  async list(params: {
    studentId?: string;
    classId?: string;
    subclassId?: string;
    subjectId?: string;
    sessionId?: string;
    termId?: string;
  }) {
    const where: Prisma.StudentSubjectRegistrationWhereInput = {};
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subclassId?.trim()) where.subclassId = params.subclassId.trim();
    if (params.subjectId?.trim()) where.subjectId = params.subjectId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();

    const rows = await this.prisma.studentSubjectRegistration.findMany({
      where,
      include,
      orderBy: [
        { sessionId: "desc" },
        { termId: "asc" },
        { studentId: "asc" },
        { subject: { code: "asc" } },
      ],
    });
    return { studentSubjectRegistrations: this.groupByStudentClassSubclassSessionAndTerm(rows) };
  }

  async listRegisteredSubjects(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
  }): Promise<{ subjects: RegisteredSubjectSummary[] }> {
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    const subclassId = params.subclassId?.trim();

    if (!classId || !sessionId || !termId) {
      throw new Error("classId, sessionId, and termId are required");
    }

    const subjects = await this.prisma.subject.findMany({
      where: {
        studentSubjectRegistrations: {
          some: {
            classId,
            sessionId,
            termId,
            ...(subclassId ? { subclassId } : {}),
          },
        },
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });

    return { subjects };
  }

  async getById(id: string): Promise<StudentSubjectRegistrationData | null> {
    const row = await this.prisma.studentSubjectRegistration.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      studentId?: string;
      classId?: string;
      subclassId?: string | null;
      subjectId?: string;
      sessionId?: string;
      termId?: string;
    }
  ): Promise<StudentSubjectRegistrationData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student subject registration not found");
    if (existing.scoreCount > 0) {
      throw new Error("Cannot update registration with existing assessment scores");
    }

    const payload = {
      studentId: (input.studentId ?? existing.studentId).trim(),
      classId: (input.classId ?? existing.classId).trim(),
      subclassId:
        input.subclassId !== undefined ? input.subclassId?.trim() || null : existing.subclassId,
      subjectId: (input.subjectId ?? existing.subjectId).trim(),
      sessionId: (input.sessionId ?? existing.sessionId).trim(),
      termId: (input.termId ?? existing.termId).trim(),
    };
    await this.assertRefs(payload);

    try {
      const row = await this.prisma.studentSubjectRegistration.update({
        where: { id },
        data: {
          ...(input.studentId !== undefined ? { studentId: payload.studentId } : {}),
          ...(input.classId !== undefined ? { classId: payload.classId } : {}),
          ...(input.subclassId !== undefined ? { subclassId: payload.subclassId } : {}),
          ...(input.subjectId !== undefined ? { subjectId: payload.subjectId } : {}),
          ...(input.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
          ...(input.termId !== undefined ? { termId: payload.termId } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student subject registration not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Student is already registered for this subject in the session and term");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StudentSubjectRegistrationData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student subject registration not found");
    if (existing.scoreCount > 0) {
      throw new Error("Cannot delete registration with assessment scores");
    }
    // if exists in student assessment score, throw error
    const studentAssessmentScore = await this.prisma.studentAssessmentScore.findFirst({
      where: { studentSubjectRegistrationId: id },
    });
    if (studentAssessmentScore) {
      throw new Error("Cannot delete registration because it is referenced by assessment scores");
    }
    try {
      const row = await this.prisma.studentSubjectRegistration.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student subject registration not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete: registration is referenced by other records");
      }
      throw e;
    }
  }
}

export const studentSubjectRegistrationService = new StudentSubjectRegistrationService();
