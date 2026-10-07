import { UserType } from "@prisma/client";
import { activePeriodService } from "../services/activePeriodService";
import prisma from "./prisma";

export interface StudentAcademicContext {
  studentId: string;
  classId: string;
  sessionId: string;
  termId: string;
}

export interface ResolveStudentAcademicContextInput {
  userId: string;
  classId?: string | null;
  sessionId?: string | null;
  termId?: string | null;
}

/**
 * Resolves academic scope for the authenticated student user.
 * - studentId from Student.userId
 * - classId from input or the student's current class
 * - sessionId / termId from input or the active period singleton
 */
export async function resolveStudentAcademicContext(
  input: ResolveStudentAcademicContextInput
): Promise<StudentAcademicContext> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, userType: true },
  });
  if (!user) throw new Error("Unauthorized");
  if (user.userType !== UserType.Student) {
    throw new Error("This action is only available to student users");
  }

  const student = await prisma.student.findFirst({
    where: { userId },
    select: { id: true, classId: true },
  });
  if (!student) throw new Error("No student profile linked to this user");

  const classIdOverride = input.classId?.trim() || null;
  const classId = classIdOverride || student.classId?.trim() || null;
  if (!classId) throw new Error("classId is required");
  if (classIdOverride && student.classId !== classIdOverride) {
    throw new Error("classId does not match the authenticated student's class");
  }

  let sessionId = input.sessionId?.trim() || null;
  let termId = input.termId?.trim() || null;

  if (!sessionId || !termId) {
    const activePeriod = await activePeriodService.getActivePeriod();
    if (!activePeriod) throw new Error("No active period configured");
    sessionId = sessionId || activePeriod.sessionId;
    termId = termId || activePeriod.termId;
  }

  const [cls, session, term] = await Promise.all([
    prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true } }),
    prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
    prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
  ]);
  if (!cls) throw new Error("Invalid classId");
  if (!session) throw new Error("Invalid sessionId");
  if (!term) throw new Error("Invalid termId");

  return {
    studentId: student.id,
    classId,
    sessionId,
    termId,
  };
}

/**
 * Resolves the guardian email for the authenticated parent user (login email).
 */
export async function resolveParentGuardianEmail(userId: string): Promise<string> {
  const id = userId.trim();
  if (!id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, userType: true, email: true },
  });
  if (!user) throw new Error("Unauthorized");
  if (user.userType !== UserType.Parent) {
    throw new Error("This action is only available to parent users");
  }

  const guardianEmail = user.email.trim().toLowerCase();
  if (!guardianEmail) throw new Error("Parent user email is required");

  return guardianEmail;
}
