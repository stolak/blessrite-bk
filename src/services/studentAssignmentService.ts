import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { AssignmentStatus, Prisma } from "@prisma/client";
import { assignmentInclude, mapAssignmentRow, type AssignmentData } from "./assignmentService";

const include = {
  assignment: {
    select: {
      id: true,
      topic: true,
      question: true,
      deadline: true,
      status: true,
      assignmentComponentId: true,
      assignmentComponent: { select: { id: true, name: true, maxScore: true } },
      subject: { select: { id: true, name: true, status: true } },
    },
  },
  student: {
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true },
  },
  class: { select: { id: true, name: true, status: true } },
  subclass: { select: { id: true, name: true, status: true } },
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
  gradedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  attachments: {
    select: { id: true, url: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.StudentAssignmentInclude;

type Row = Prisma.StudentAssignmentGetPayload<{ include: typeof include }>;

export interface StudentAssignmentAttachmentData {
  id: string;
  url: string;
  createdAt: Date;
}

export interface StudentAssignmentData {
  id: string;
  assignmentId: string;
  assignment: Row["assignment"];
  answer: string | null;
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
  score: string | null;
  status: AssignmentStatus;
  submittedAt: Date | null;
  gradedAt: Date | null;
  gradedBy: string | null;
  gradedByUser: Row["gradedByUser"];
  createdAt: Date;
  updatedAt: Date;
  attachments: StudentAssignmentAttachmentData[];
}

function mapAttachment(row: Row["attachments"][number]): StudentAssignmentAttachmentData {
  return { id: row.id, url: row.url, createdAt: row.createdAt };
}

function mapRow(row: Row): StudentAssignmentData {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    assignment: row.assignment,
    answer: row.answer,
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
    score: row.score?.toString() ?? null,
    status: row.status,
    submittedAt: row.submittedAt,
    gradedAt: row.gradedAt,
    gradedBy: row.gradedBy,
    gradedByUser: row.gradedByUser,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachments: row.attachments.map(mapAttachment),
  };
}

function normalizeUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const normalized = urls.map((url) => url.trim()).filter(Boolean);
  if (normalized.length !== urls.length) {
    throw new Error("attachments must be non-empty strings");
  }
  return normalized;
}

function hasSubmissionContent(answer?: string | null, attachments?: string[]): boolean {
  return Boolean(answer?.trim()) || Boolean(attachments?.length);
}

export class StudentAssignmentService {
  private prisma = prisma;

  private async assertRefs(input: {
    studentId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    assignmentId: string;
    gradedById?: string | null;
  }): Promise<void> {
    const [student, cls, session, term, assignment] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, classId: true },
      }),
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
      this.prisma.assignment.findUnique({
        where: { id: input.assignmentId },
        select: {
          id: true,
          classId: true,
          sessionId: true,
          termId: true,
          assignmentComponent: { select: { maxScore: true } },
        },
      }),
    ]);

    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (!assignment) throw new Error("Invalid assignmentId");

    if (student.classId !== input.classId) {
      throw new Error("studentId does not belong to the specified classId");
    }
    if (
      assignment.classId !== input.classId ||
      assignment.sessionId !== input.sessionId ||
      assignment.termId !== input.termId
    ) {
      throw new Error("assignment does not match classId, sessionId, and termId");
    }

    if (input.subclassId) {
      const subclass = await this.prisma.subClass.findUnique({
        where: { id: input.subclassId },
        select: { id: true, classId: true },
      });
      if (!subclass) throw new Error("Invalid subclassId");
      if (subclass.classId && subclass.classId !== input.classId) {
        throw new Error("subclassId does not belong to classId");
      }
    }

    if (input.gradedById) {
      const grader = await this.prisma.user.findUnique({
        where: { id: input.gradedById },
        select: { id: true },
      });
      if (!grader) throw new Error("Invalid gradedBy");
    }
  }

  private assertScoreWithinMax(score: Prisma.Decimal, maxScore: Prisma.Decimal): void {
    if (score.gt(maxScore)) {
      throw new Error(`score cannot exceed component maxScore (${maxScore.toString()})`);
    }
  }

  async create(input: {
    assignmentId: string;
    studentId: string;
    classId: string;
    subclassId?: string | null;
    sessionId: string;
    termId: string;
    answer?: string | null;
    attachments?: string[];
  }): Promise<{ studentAssignment: StudentAssignmentData; created: boolean }> {
    const assignmentId = input.assignmentId.trim();
    const studentId = input.studentId.trim();
    const classId = input.classId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    const subclassId = input.subclassId?.trim() || null;
    const answer = input.answer?.trim() || null;

    if (!assignmentId || !studentId || !classId || !sessionId || !termId) {
      throw new Error("assignmentId, studentId, classId, sessionId, and termId are required");
    }

    await this.assertRefs({ studentId, classId, subclassId, sessionId, termId, assignmentId });

    const attachments = normalizeUrls(input.attachments);
    const submitting = hasSubmissionContent(answer, attachments);

    const existing = await this.prisma.studentAssignment.findFirst({
      where: { studentId, assignmentId, sessionId, termId },
      select: { id: true },
    });

    const submissionData = submitting
      ? {
          status: AssignmentStatus.Submitted,
          submittedAt: new Date(),
          answer,
        }
      : { answer };

    try {
      const row = existing
        ? await this.prisma.studentAssignment.update({
            where: { id: existing.id },
            data: {
              ...submissionData,
              ...(attachments.length
                ? { attachments: { create: attachments.map((url) => ({ url })) } }
                : {}),
            },
            include,
          })
        : await this.prisma.studentAssignment.create({
            data: {
              assignmentId,
              studentId,
              classId,
              subclassId,
              sessionId,
              termId,
              ...submissionData,
              status: submitting ? AssignmentStatus.Submitted : AssignmentStatus.Pending,
              ...(submitting ? { submittedAt: new Date() } : {}),
              ...(attachments.length
                ? { attachments: { create: attachments.map((url) => ({ url })) } }
                : {}),
            },
            include,
          });

      return { studentAssignment: mapRow(row), created: !existing };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error(
          "Student assignment already exists for this student, assignment, session, and term"
        );
      }
      throw e;
    }
  }

  async list(params: {
    assignmentId?: string;
    studentId?: string;
    classId?: string;
    subclassId?: string;
    sessionId?: string;
    termId?: string;
    status?: AssignmentStatus;
  }) {
    const where: Prisma.StudentAssignmentWhereInput = {};
    if (params.assignmentId?.trim()) where.assignmentId = params.assignmentId.trim();
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subclassId?.trim()) where.subclassId = params.subclassId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.status) where.status = params.status;

    const rows = await this.prisma.studentAssignment.findMany({
      where,
      include,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    });
    return { studentAssignments: rows.map(mapRow), count: rows.length };
  }

  async listUntreated(params: {
    studentId: string;
    classId: string;
    sessionId: string;
    termId: string;
  }): Promise<AssignmentData[]> {
    const studentId = params.studentId.trim();
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();

    if (!studentId || !classId || !sessionId || !termId) {
      throw new Error("studentId, classId, sessionId, and termId are required");
    }

    const [student, cls, session, term] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, classId: true },
      }),
      this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
    ]);

    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (student.classId !== classId) {
      throw new Error("studentId does not belong to the specified classId");
    }

    const registrations = await this.prisma.studentSubjectRegistration.findMany({
      where: { studentId, classId, sessionId, termId },
      select: { subjectId: true },
    });
    const subjectIds = [...new Set(registrations.map((row) => row.subjectId))];
    if (!subjectIds.length) return [];

    const existingStudentAssignments = await this.prisma.studentAssignment.findMany({
      where: { studentId, sessionId, termId },
      select: { assignmentId: true },
    });
    const treatedAssignmentIds = existingStudentAssignments.map((row) => row.assignmentId);

    const rows = await this.prisma.assignment.findMany({
      where: {
        classId,
        sessionId,
        termId,
        subjectId: { in: subjectIds },
        ...(treatedAssignmentIds.length ? { id: { notIn: treatedAssignmentIds } } : {}),
      },
      include: assignmentInclude,
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    });

    return rows.map(mapAssignmentRow);
  }

  async getById(id: string): Promise<StudentAssignmentData | null> {
    const row = await this.prisma.studentAssignment.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      answer?: string | null;
      score?: string | number | null;
      status?: AssignmentStatus;
      gradedById?: string | null;
    }
  ): Promise<StudentAssignmentData> {
    const existing = await this.prisma.studentAssignment.findUnique({
      where: { id },
      include: {
        assignment: {
          select: {
            assignmentComponent: { select: { maxScore: true } },
          },
        },
      },
    });
    if (!existing) throw new Error("Student assignment not found");

    const data: Prisma.StudentAssignmentUpdateInput = {};

    if (input.answer !== undefined) {
      data.answer = input.answer?.trim() || null;
      if (data.answer) {
        data.status = AssignmentStatus.Submitted;
        data.submittedAt = new Date();
      }
    }

    if (input.score !== undefined) {
      if (input.score === null) {
        data.score = null;
        data.gradedAt = null;
        data.gradedByUser = { disconnect: true };
      } else {
        const score = parseDecimalNonNegative(input.score, "score");
        const maxScore = existing.assignment.assignmentComponent?.maxScore;
        if (maxScore) this.assertScoreWithinMax(score, maxScore);
        data.score = score;
        data.status = AssignmentStatus.Graded;
        data.gradedAt = new Date();
        if (input.gradedById) {
          const gradedById = input.gradedById.trim();
          if (!gradedById) throw new Error("gradedById cannot be empty");
          const grader = await this.prisma.user.findUnique({
            where: { id: gradedById },
            select: { id: true },
          });
          if (!grader) throw new Error("Invalid gradedById");
          data.gradedByUser = { connect: { id: gradedById } };
        }
      }
    }

    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === AssignmentStatus.Submitted && input.answer === undefined) {
        data.submittedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      throw new Error("At least one field must be provided");
    }

    try {
      const row = await this.prisma.studentAssignment.update({
        where: { id },
        data,
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student assignment not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StudentAssignmentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student assignment not found");

    try {
      const row = await this.prisma.studentAssignment.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student assignment not found");
      }
      throw e;
    }
  }

  async addAttachment(studentAssignmentId: string, url: string): Promise<StudentAssignmentData> {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) throw new Error("url is required");

    const existing = await this.getById(studentAssignmentId);
    if (!existing) throw new Error("Student assignment not found");

    await this.prisma.studentAssignment.update({
      where: { id: studentAssignmentId },
      data: {
        attachments: { create: { url: trimmedUrl } },
        ...(existing.status === AssignmentStatus.Pending
          ? { status: AssignmentStatus.Submitted, submittedAt: new Date() }
          : {}),
      },
    });

    const row = await this.prisma.studentAssignment.findUniqueOrThrow({
      where: { id: studentAssignmentId },
      include,
    });
    return mapRow(row);
  }

  async removeAttachment(
    studentAssignmentId: string,
    attachmentId: string
  ): Promise<StudentAssignmentData> {
    const existing = await this.getById(studentAssignmentId);
    if (!existing) throw new Error("Student assignment not found");

    const attachment = await this.prisma.studentAssignmentAttachment.findFirst({
      where: { id: attachmentId, studentAssignmentId },
      select: { id: true },
    });
    if (!attachment) throw new Error("Student assignment attachment not found");

    await this.prisma.studentAssignmentAttachment.delete({ where: { id: attachmentId } });

    const row = await this.prisma.studentAssignment.findUniqueOrThrow({
      where: { id: studentAssignmentId },
      include,
    });
    return mapRow(row);
  }
}

export const studentAssignmentService = new StudentAssignmentService();
