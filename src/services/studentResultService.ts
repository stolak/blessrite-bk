import prisma from "../utils/prisma";
import { studentAssessmentScoreService } from "./studentAssessmentScoreService";
import { studentBehaviouralAssessmentScoreService } from "./studentBehaviouralAssessmentScoreService";
import { attendanceRecordService } from "./attendanceRecordService";
import { assessmentRemarksService } from "./assessmentRemarksService";

export interface StudentResultPeriod {
  classId: string;
  class: string;
  sessionId: string;
  session: string;
  termId: string;
  term: string;
}

export interface StudentResultResponse {
  admissionNumber: string;
  studentName: string;
  consideredClassId: string;
  consideredClass: string;
  consideredSubclass?: string;
  sessionId: string;
  session: string;
  termId: string;
  term: string;
  imageUrl: string | null;
  subjectsScore: Array<{
    subjectId: string;
    subjectName: string;
    componentScore: Array<{
      componentId: string;
      component: string;
      shortName: string | null;
      maxScore: number;
      score: number;
    }>;
    totalScore: number;
    grade: string;
    remark: string;
    position: number;
    studentAverage: number;
    studentHighest: number;
    studentLowest: number;
  }>;
  overallSubjectScore: number;
  averageSubjectScore: number;
  behaviouralScore: Array<{
    score: string;
    scoreGrade: {
      grade: string;
      remark: string;
      gradePoint: string;
    };
    behaviouralAssessmentComponent: {
      id: string;
      name: string;
      maxScore: string;
      orderNo: number;
    };
  }>;
  schoolOpenedDays: number;
  totalAttendance: number;
  studentAssessRemarks: {
    classTeacherRemark: string | null;
    headTeacherRemark: string | null;
    principalRemark: string | null;
  };
}

export class StudentResultService {
  private prisma = prisma;

  /**
   * Distinct class/session/term periods where the student has assessment scores.
   */
  async listStudentResultPeriods(studentId: string): Promise<StudentResultPeriod[]> {
    const normalizedStudentId = studentId.trim();
    if (!normalizedStudentId) {
      throw new Error("studentId is required");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: normalizedStudentId },
      select: { id: true },
    });
    if (!student) {
      throw new Error("Student not found");
    }

    const rows = await this.prisma.studentAssessmentScore.findMany({
      where: {
        OR: [
          { studentId: normalizedStudentId },
          { studentSubjectRegistration: { studentId: normalizedStudentId } },
        ],
      },
      distinct: ["sessionId", "termId", "classId"],
      select: {
        classId: true,
        sessionId: true,
        termId: true,
        class: { select: { name: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
      },
      orderBy: [{ sessionId: "desc" }, { termId: "desc" }, { classId: "asc" }],
    });

    return rows.map((row) => ({
      classId: row.classId,
      class: row.class.name,
      sessionId: row.sessionId,
      session: row.session.name,
      termId: row.termId,
      term: row.term.name,
    }));
  }

  async getStudentResult(params: {
    studentId: string;
    sessionId: string;
    termId: string;
  }): Promise<StudentResultResponse> {
    const studentId = params.studentId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();

    if (!studentId || !sessionId || !termId) {
      throw new Error("studentId, sessionId, and termId are required");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        classId: true,
        subClassId: true,
        imageUrl: true,
      },
    });
    if (!student) throw new Error("Invalid studentId");

    const registration = await this.prisma.studentSubjectRegistration.findFirst({
      where: { studentId, sessionId, termId },
      select: { classId: true, subclassId: true },
    });

    const classId = registration?.classId || student.classId;
    if (!classId) {
      throw new Error("Student has no class for the selected session and term");
    }

    const subclassId = registration?.subclassId || student.subClassId || undefined;

    const [assessmentReport, behaviouralResult, attendanceReport, remarksResult] =
      await Promise.all([
        studentAssessmentScoreService.getStudentAssessmentReport({
          studentId,
          classId,
          sessionId,
          termId,
        }),
        studentBehaviouralAssessmentScoreService
          .getStudentBehaviouralScores({
            studentId,
            classId,
            sessionId,
            termId,
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "";
            if (
              message.includes("No behavioural assessment template") ||
              message.includes("does not belong to the specified classId")
            ) {
              return null;
            }
            throw error;
          }),
        attendanceRecordService.getStudentAttendanceReport({
          studentId,
          sessionId,
          termId,
          classId,
          ...(subclassId ? { subclassId } : {}),
        }),
        assessmentRemarksService.list({
          studentId,
          classId,
          sessionId,
          termId,
        }),
      ]);

    const remarks = remarksResult.assessmentRemarks[0] ?? null;

    return {
      admissionNumber: assessmentReport.admissionNumber,
      studentName: assessmentReport.studentName,
      consideredClassId: assessmentReport.consideredClassId,
      consideredClass: assessmentReport.consideredClass,
      ...(assessmentReport.consideredSubclass
        ? { consideredSubclass: assessmentReport.consideredSubclass }
        : {}),
      sessionId: assessmentReport.sessionId,
      session: assessmentReport.session,
      termId: assessmentReport.termId,
      term: assessmentReport.term,
      imageUrl: student.imageUrl ?? null,
      subjectsScore: assessmentReport.subjects,
      overallSubjectScore: assessmentReport.overallScore,
      averageSubjectScore: assessmentReport.averageScore,
      behaviouralScore: behaviouralResult?.score ?? [],
      schoolOpenedDays: attendanceReport.schoolOpenedDays,
      totalAttendance: attendanceReport.totalAttendance,
      studentAssessRemarks: {
        classTeacherRemark: remarks?.classTeacherRemark ?? null,
        headTeacherRemark: remarks?.headTeacherRemark ?? null,
        principalRemark: remarks?.principalRemark ?? null,
      },
    };
  }
}

export const studentResultService = new StudentResultService();
