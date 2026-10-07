import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { AssignmentStatus, Prisma } from "@prisma/client";

export const assignmentInclude = {
  class: { select: { id: true, name: true, status: true } },
  subject: { select: { id: true, code: true, name: true, status: true } },
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
  assignmentComponent: {
    select: { id: true, name: true, shortName: true, maxScore: true, status: true },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  attachments: {
    select: { id: true, url: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.AssignmentInclude;

type Row = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

export interface AssignmentAttachmentData {
  id: string;
  url: string;
  createdAt: Date;
}

export interface AssignmentData {
  id: string;
  topic: string;
  question: string;
  classId: string;
  class: Row["class"];
  subjectId: string;
  subject: Row["subject"];
  sessionId: string;
  session: Row["session"];
  termId: string;
  term: Row["term"];
  assignmentComponentId: string | null;
  assignmentComponent:
    | (Omit<NonNullable<Row["assignmentComponent"]>, "maxScore"> & { maxScore: string })
    | null;
  deadline: Date | null;
  status: AssignmentStatus;
  createdById: string;
  createdBy: Row["createdBy"];
  createdAt: Date;
  updatedAt: Date;
  attachments: AssignmentAttachmentData[];
}

function mapAttachment(row: Row["attachments"][number]): AssignmentAttachmentData {
  return { id: row.id, url: row.url, createdAt: row.createdAt };
}

export function mapAssignmentRow(row: Row): AssignmentData {
  return {
    id: row.id,
    topic: row.topic,
    question: row.question,
    classId: row.classId,
    class: row.class,
    subjectId: row.subjectId,
    subject: row.subject,
    sessionId: row.sessionId,
    session: row.session,
    termId: row.termId,
    term: row.term,
    assignmentComponentId: row.assignmentComponentId,
    assignmentComponent: row.assignmentComponent
      ? {
          ...row.assignmentComponent,
          maxScore: row.assignmentComponent.maxScore.toString(),
        }
      : null,
    deadline: row.deadline,
    status: row.status,
    createdById: row.createdById,
    createdBy: row.createdBy,
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

export class AssignmentService {
  private prisma = prisma;

  private async assertRefs(input: {
    classId: string;
    subjectId: string;
    sessionId: string;
    termId: string;
    assignmentComponentId?: string | null;
    createdById: string;
  }): Promise<void> {
    const [cls, subject, session, term, user] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: input.createdById }, select: { id: true } }),
    ]);
    if (!cls) throw new Error("Invalid classId");
    if (!subject) throw new Error("Invalid subjectId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (!user) throw new Error("Invalid createdById");

    if (input.assignmentComponentId) {
      const component = await this.prisma.assessmentComponent.findUnique({
        where: { id: input.assignmentComponentId },
        select: { id: true },
      });
      if (!component) throw new Error("Invalid assignmentComponentId");
    }
  }

  async create(input: {
    topic: string;
    question: string;
    classId: string;
    subjectId: string;
    sessionId: string;
    termId: string;
    assignmentComponentId?: string | null;
    deadline?: Date | null;
    status?: AssignmentStatus;
    createdById: string;
    attachments?: string[];
  }): Promise<AssignmentData> {
    const topic = input.topic.trim();
    const question = input.question.trim();
    const classId = input.classId.trim();
    const subjectId = input.subjectId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    const assignmentComponentId = input.assignmentComponentId?.trim() || null;
    const createdById = input.createdById.trim();

    if (!topic) throw new Error("topic is required");
    if (!question) throw new Error("question is required");
    if (!classId || !subjectId || !sessionId || !termId) {
      throw new Error("classId, subjectId, sessionId, and termId are required");
    }
    if (!createdById) throw new Error("createdById is required");

    await this.assertRefs({
      classId,
      subjectId,
      sessionId,
      termId,
      assignmentComponentId,
      createdById,
    });

    const attachments = normalizeUrls(input.attachments);

    const row = await this.prisma.assignment.create({
      data: {
        topic,
        question,
        classId,
        subjectId,
        sessionId,
        termId,
        assignmentComponentId,
        deadline: input.deadline ?? null,
        status: input.status ?? AssignmentStatus.Pending,
        createdById,
        ...(attachments.length
          ? { attachments: { create: attachments.map((url) => ({ url })) } }
          : {}),
      },
      include: assignmentInclude,
    });
    return mapAssignmentRow(row);
  }

  async list(params: {
    classId?: string;
    subjectId?: string;
    sessionId?: string;
    termId?: string;
    status?: AssignmentStatus;
    createdById?: string;
  }) {
    const where: Prisma.AssignmentWhereInput = {};
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subjectId?.trim()) where.subjectId = params.subjectId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.status) where.status = params.status;
    if (params.createdById?.trim()) where.createdById = params.createdById.trim();

    const rows = await this.prisma.assignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: [{ createdAt: "desc" }],
    });
    return { assignments: rows.map(mapAssignmentRow), count: rows.length };
  }

  async getById(id: string): Promise<AssignmentData | null> {
    const row = await this.prisma.assignment.findUnique({ where: { id }, include: assignmentInclude });
    return row ? mapAssignmentRow(row) : null;
  }

  async update(
    id: string,
    input: {
      topic?: string;
      question?: string;
      classId?: string;
      subjectId?: string;
      sessionId?: string;
      termId?: string;
      assignmentComponentId?: string | null;
      deadline?: Date | null;
      status?: AssignmentStatus;
    }
  ): Promise<AssignmentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assignment not found");

    const classId = input.classId?.trim() ?? existing.classId;
    const subjectId = input.subjectId?.trim() ?? existing.subjectId;
    const sessionId = input.sessionId?.trim() ?? existing.sessionId;
    const termId = input.termId?.trim() ?? existing.termId;
    const assignmentComponentId =
      input.assignmentComponentId !== undefined
        ? input.assignmentComponentId?.trim() || null
        : existing.assignmentComponentId;

    await this.assertRefs({
      classId,
      subjectId,
      sessionId,
      termId,
      assignmentComponentId,
      createdById: existing.createdById,
    });

    if (input.topic !== undefined && !input.topic.trim()) {
      throw new Error("topic cannot be empty");
    }
    if (input.question !== undefined && !input.question.trim()) {
      throw new Error("question cannot be empty");
    }

    try {
      const row = await this.prisma.assignment.update({
        where: { id },
        data: {
          ...(input.topic !== undefined ? { topic: input.topic.trim() } : {}),
          ...(input.question !== undefined ? { question: input.question.trim() } : {}),
          ...(input.classId !== undefined ? { classId } : {}),
          ...(input.subjectId !== undefined ? { subjectId } : {}),
          ...(input.sessionId !== undefined ? { sessionId } : {}),
          ...(input.termId !== undefined ? { termId } : {}),
          ...(input.assignmentComponentId !== undefined ? { assignmentComponentId } : {}),
          ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: assignmentInclude,
      });
      return mapAssignmentRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assignment not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AssignmentData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Assignment not found");

    const submissionCount = await this.prisma.studentAssignment.count({ where: { assignmentId: id } });
    if (submissionCount > 0) {
      throw new Error("Cannot delete: assignment has student submissions");
    }

    try {
      const row = await this.prisma.assignment.delete({ where: { id }, include: assignmentInclude });
      return mapAssignmentRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Assignment not found");
      }
      throw e;
    }
  }

  async addAttachment(assignmentId: string, url: string): Promise<AssignmentData> {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) throw new Error("url is required");

    const existing = await this.getById(assignmentId);
    if (!existing) throw new Error("Assignment not found");

    await this.prisma.assignmentAttachment.create({
      data: { assignmentId, url: trimmedUrl },
    });

    const row = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: assignmentInclude,
    });
    return mapAssignmentRow(row);
  }

  async removeAttachment(assignmentId: string, attachmentId: string): Promise<AssignmentData> {
    const existing = await this.getById(assignmentId);
    if (!existing) throw new Error("Assignment not found");

    const attachment = await this.prisma.assignmentAttachment.findFirst({
      where: { id: attachmentId, assignmentId },
      select: { id: true },
    });
    if (!attachment) throw new Error("Assignment attachment not found");

    await this.prisma.assignmentAttachment.delete({ where: { id: attachmentId } });

    const row = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: assignmentInclude,
    });
    return mapAssignmentRow(row);
  }
}

export const assignmentService = new AssignmentService();
