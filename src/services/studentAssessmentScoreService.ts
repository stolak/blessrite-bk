import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  studentSubjectRegistration: {
    select: {
      id: true,
      studentId: true,
      student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true } },
    },
  },
  class: { select: { id: true, name: true } },
  subclass: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true, status: true } },
  component: { select: { id: true, name: true, shortName: true, maxScore: true, isLocked: true } },
  term: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
} satisfies Prisma.StudentAssessmentScoreInclude;

type Row = Prisma.StudentAssessmentScoreGetPayload<{ include: typeof include }>;

export interface StudentAssessmentScoreData {
  id: string;
  studentSubjectRegistrationId: string;
  studentSubjectRegistration: Row["studentSubjectRegistration"];
  classId: string;
  class: Row["class"];
  subclassId: string | null;
  subclass: Row["subclass"];
  subjectId: string;
  subject: Row["subject"];
  componentId: string;
  component: Row["component"];
  termId: string;
  term: Row["term"];
  sessionId: string;
  session: Row["session"];
  score: string;
}

export interface ScoreSheetEntry {
  studentName: string;
  studentSubjectRegistrationId: string;
  score: number;
}

export interface ScoreSheetResult {
  componentId: string;
  subjectScores: ScoreSheetEntry[];
}

export interface StudentComponentScoreEntry {
  componentId: string;
  component: string;
  shortName: string | null;
  maxScore: number;
  score: number;
}

export interface StudentSubjectScoreSummary {
  studentId: string;
  studentName: string;
  componentScore: StudentComponentScoreEntry[];
  totalScore: number;
}

export interface StudentSubjectScoresResult {
  template: { id: string; name: string };
  gradeTemplate: { id: string; name: string; version: number } | null;
  components: { id: string; name: string; shortName: string | null; maxScore: number; rank: number }[];
  students: StudentSubjectScoreSummary[];
}

export interface StudentSubjectScoreReportSummary extends StudentSubjectScoreSummary {
  grade: string;
  remark: string;
  gradePoint: string;
  position: number;
}

export interface StudentSubjectScoreReportResult extends Omit<
  StudentSubjectScoresResult,
  "students"
> {
  students: StudentSubjectScoreReportSummary[];
}

export interface StudentAssessmentReportSubject {
  subjectId: string;
  subjectName: string;
  componentScore: StudentComponentScoreEntry[];
  totalScore: number;
  grade: string;
  remark: string;
  position: number;
  studentAverage: number;
  studentHighest: number;
  studentLowest: number;
}

export interface StudentAssessmentReportResult {
  admissionNumber: string;
  studentName: string;
  consideredClassId: string;
  consideredClass: string;
  consideredSubclass?: string;
  sessionId: string;
  session: string;
  termId: string;
  term: string;
  subjects: StudentAssessmentReportSubject[];
  overallScore: number;
  averageScore: number;
}

export interface BroadsheetSubjectEntry {
  id: string;
  subjectName: string;
  totalScore: number;
  grade: string;
}

export interface BroadsheetStudentEntry {
  studentId: string;
  studentName: string;
  subjects: BroadsheetSubjectEntry[];
}

type GradeBand = {
  grade: string;
  minScore: Prisma.Decimal;
  maxScore: Prisma.Decimal;
  remark: string | null;
  gradePoint: Prisma.Decimal;
};

type AssessmentComponentRow = {
  id: string;
  name: string;
  shortName: string | null;
  maxScore: Prisma.Decimal;
  orderNo: number;
};

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapRow(row: Row): StudentAssessmentScoreData {
  return {
    id: row.id,
    studentSubjectRegistrationId: row.studentSubjectRegistrationId,
    studentSubjectRegistration: row.studentSubjectRegistration,
    classId: row.classId,
    class: row.class,
    subclassId: row.subclassId,
    subclass: row.subclass,
    subjectId: row.subjectId,
    subject: row.subject,
    componentId: row.componentId,
    component: row.component,
    termId: row.termId,
    term: row.term,
    sessionId: row.sessionId,
    session: row.session,
    score: row.score.toString(),
  };
}

export class StudentAssessmentScoreService {
  private prisma = prisma;

  private async resolveRegistration(registrationId: string) {
    const reg = await this.prisma.studentSubjectRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        classId: true,
        subclassId: true,
        subjectId: true,
        sessionId: true,
        termId: true,
        studentId: true,
      },
    });
    if (!reg) throw new Error("Invalid studentSubjectRegistrationId");
    return reg;
  }

  private async assertComponent(componentId: string, score: Prisma.Decimal): Promise<void> {
    const component = await this.resolveComponent(componentId);
    this.assertScoreWithinMax(score, component.maxScore);
  }

  private async resolveComponent(componentId: string) {
    const component = await this.prisma.assessmentComponent.findUnique({
      where: { id: componentId },
      select: { id: true, maxScore: true, isLocked: true },
    });
    if (!component) throw new Error("Invalid componentId");
    return component;
  }

  private assertScoreWithinMax(score: Prisma.Decimal, maxScore: Prisma.Decimal): void {
    if (score.gt(maxScore)) {
      throw new Error(`score cannot exceed component maxScore (${maxScore.toString()})`);
    }
  }

  private async resolveTemplateAndComponents(classId: string, sessionId: string, termId: string) {
    const assignments = await this.prisma.classAssessmentTemplate.findMany({
      where: { classId, sessionId, termId },
      include: {
        gradeTemplate: { select: { id: true, name: true, version: true } },
        template: {
          include: {
            components: {
              where: { status: "Active" },
              select: { id: true, name: true, shortName: true, maxScore: true, orderNo: true },
              orderBy: { orderNo: "asc" },
            },
          },
        },
      },
      orderBy: { template: { name: "asc" } },
    });
    if (assignments.length === 0) {
      throw new Error("No assessment template assigned to this class for the session and term");
    }

    const componentById = new Map<
      string,
      { id: string; name: string; shortName: string | null; maxScore: Prisma.Decimal; orderNo: number }
    >();
    for (const assignment of assignments) {
      for (const component of assignment.template.components) {
        componentById.set(component.id, component);
      }
    }

    return {
      template: {
        id: assignments[0].template.id,
        name: assignments[0].template.name,
      },
      gradeTemplate: assignments[0].gradeTemplate
        ? {
            id: assignments[0].gradeTemplate.id,
            name: assignments[0].gradeTemplate.name,
            version: assignments[0].gradeTemplate.version,
          }
        : null,
      components: [...componentById.values()].sort((a, b) => a.orderNo - b.orderNo),
    };
  }

  private async resolveGradeItems(
    classId: string,
    sessionId: string,
    termId: string
  ): Promise<GradeBand[]> {
    const assignment = await this.prisma.classAssessmentTemplate.findFirst({
      where: { classId, sessionId, termId },
      select: {
        gradeTemplate: {
          select: {
            items: {
              select: {
                grade: true,
                minScore: true,
                maxScore: true,
                remark: true,
                gradePoint: true,
              },
              orderBy: { minScore: "desc" },
            },
          },
        },
      },
    });
    return assignment?.gradeTemplate?.items ?? [];
  }

  private resolveGradeForTotalScore(
    totalScore: number,
    items: GradeBand[]
  ): { grade: string; remark: string; gradePoint: string } {
    if (items.length === 0) {
      return { grade: "NA", remark: "NA", gradePoint: "NA" };
    }

    const score = new Prisma.Decimal(totalScore);
    const match = items.find(
      (item) => !score.lessThan(item.minScore) && !score.greaterThan(item.maxScore)
    );
    if (!match) {
      return { grade: "NA", remark: "NA", gradePoint: "NA" };
    }

    return {
      grade: match.grade,
      remark: match.remark ?? "NA",
      gradePoint: match.gradePoint.toString(),
    };
  }

  private assignPositions(
    students: { studentId: string; totalScore: number }[]
  ): Map<string, number> {
    const sorted = [...students].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.studentId.localeCompare(b.studentId);
    });

    const positionByStudentId = new Map<string, number>();
    for (let i = 0; i < sorted.length; i++) {
      const position =
        i > 0 && sorted[i].totalScore === sorted[i - 1].totalScore
          ? positionByStudentId.get(sorted[i - 1].studentId)!
          : i + 1;
      positionByStudentId.set(sorted[i].studentId, position);
    }
    return positionByStudentId;
  }

  private buildComponentScores(
    registrationId: string,
    components: AssessmentComponentRow[],
    scoreByRegistrationAndComponent: Map<string, Map<string, Prisma.Decimal>>
  ): StudentComponentScoreEntry[] {
    const scoresForRegistration = scoreByRegistrationAndComponent.get(registrationId);
    return components.map((component) => ({
      componentId: component.id,
      component: component.name,
      shortName: component.shortName,
      maxScore: Number(component.maxScore.toString()),
      score: scoresForRegistration?.has(component.id)
        ? Number(scoresForRegistration.get(component.id)!.toString())
        : 0,
    }));
  }

  private totalFromComponentScores(componentScore: StudentComponentScoreEntry[]): number {
    return componentScore.reduce((sum, entry) => sum + entry.score, 0);
  }

  private classStatsForTotals(totals: number[]): {
    studentAverage: number;
    studentHighest: number;
    studentLowest: number;
  } {
    if (totals.length === 0) {
      return { studentAverage: 0, studentHighest: 0, studentLowest: 0 };
    }
    const sum = totals.reduce((acc, value) => acc + value, 0);
    return {
      studentAverage: roundScore(sum / totals.length),
      studentHighest: Math.max(...totals),
      studentLowest: Math.min(...totals),
    };
  }

  private async resolveRegistrations(registrationIds: string[]) {
    const uniqueIds = [...new Set(registrationIds)];
    const registrations = await this.prisma.studentSubjectRegistration.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        classId: true,
        subclassId: true,
        subjectId: true,
        sessionId: true,
        termId: true,
        studentId: true,
      },
    });
    if (registrations.length !== uniqueIds.length) {
      throw new Error("Invalid studentSubjectRegistrationId");
    }
    return new Map(registrations.map((reg) => [reg.id, reg]));
  }

  async create(input: {
    studentSubjectRegistrationId: string;
    componentId: string;
    score: string | number;
  }): Promise<StudentAssessmentScoreData> {
    const registrationId = input.studentSubjectRegistrationId.trim();
    const componentId = input.componentId.trim();
    if (!registrationId) throw new Error("studentSubjectRegistrationId is required");
    if (!componentId) throw new Error("componentId is required");

    const reg = await this.resolveRegistration(registrationId);
    const score = parseDecimalNonNegative(input.score, "score");
    await this.assertComponent(componentId, score);

    const row = await this.prisma.studentAssessmentScore.create({
      data: {
        studentSubjectRegistrationId: registrationId,
        componentId,
        score,
        classId: reg.classId,
        subclassId: reg.subclassId,
        subjectId: reg.subjectId,
        termId: reg.termId,
        sessionId: reg.sessionId,
        studentId: reg.studentId,
      },
      include,
    });
    return mapRow(row);
  }

  async createMany(input: {
    componentId: string;
    subjectScores: { studentSubjectRegistrationId: string; score: string | number }[];
  }): Promise<{ studentAssessmentScores: StudentAssessmentScoreData[]; count: number }> {
    const componentId = input.componentId.trim();
    if (!componentId) throw new Error("componentId is required");
    if (!Array.isArray(input.subjectScores) || input.subjectScores.length === 0) {
      throw new Error("subjectScores must be a non-empty array");
    }

    const subjectScores = input.subjectScores.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`subjectScores[${index}] must be an object`);
      }
      const registrationId = entry.studentSubjectRegistrationId;
      if (typeof registrationId !== "string" || !registrationId.trim()) {
        throw new Error(
          `subjectScores[${index}].studentSubjectRegistrationId must be a non-empty string`
        );
      }
      return {
        studentSubjectRegistrationId: registrationId.trim(),
        score: parseDecimalNonNegative(entry.score, `subjectScores[${index}].score`),
      };
    });

    const registrationIds = subjectScores.map((entry) => entry.studentSubjectRegistrationId);
    const duplicateIds = [
      ...new Set(registrationIds.filter((id, index) => registrationIds.indexOf(id) !== index)),
    ];
    if (duplicateIds.length > 0) {
      const duplicates = await this.prisma.studentSubjectRegistration.findMany({
        where: { id: { in: duplicateIds } },
        select: { subject: { select: { name: true } } },
      });
      const names = duplicates.map((row) => row.subject.name);
      throw new Error(`Duplicate subjects in request: ${names.join(", ")}`);
    }

    const component = await this.resolveComponent(componentId);
    for (const entry of subjectScores) {
      this.assertScoreWithinMax(entry.score, component.maxScore);
    }

    const registrationById = await this.resolveRegistrations(registrationIds);

    const existingScores = await this.prisma.studentAssessmentScore.findMany({
      where: {
        componentId,
        studentSubjectRegistrationId: { in: registrationIds },
      },
      select: { studentSubjectRegistrationId: true },
    });
    const existingRegistrationIds = new Set(
      existingScores.map((row) => row.studentSubjectRegistrationId)
    );
    if (
      component.isLocked &&
      subjectScores.some((entry) => existingRegistrationIds.has(entry.studentSubjectRegistrationId))
    ) {
      throw new Error("Cannot update score: component is locked");
    }

    try {
      const rows = await this.prisma.$transaction(
        subjectScores.map((entry) => {
          const reg = registrationById.get(entry.studentSubjectRegistrationId)!;
          return this.prisma.studentAssessmentScore.upsert({
            where: {
              studentSubjectRegistrationId_componentId: {
                studentSubjectRegistrationId: entry.studentSubjectRegistrationId,
                componentId,
              },
            },
            create: {
              studentSubjectRegistrationId: entry.studentSubjectRegistrationId,
              componentId,
              score: entry.score,
              classId: reg.classId,
              subclassId: reg.subclassId,
              subjectId: reg.subjectId,
              termId: reg.termId,
              sessionId: reg.sessionId,
              studentId: reg.studentId,
            },
            update: { score: entry.score },
            include,
          });
        })
      );
      return { studentAssessmentScores: rows.map(mapRow), count: rows.length };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("A score already exists for this registration and component");
      }
      throw e;
    }
  }

  async list(params: {
    studentSubjectRegistrationId?: string;
    classId?: string;
    subclassId?: string;
    subjectId?: string;
    componentId?: string;
    sessionId?: string;
    termId?: string;
    studentId?: string;
  }) {
    const where: Prisma.StudentAssessmentScoreWhereInput = {};
    if (params.studentSubjectRegistrationId?.trim()) {
      where.studentSubjectRegistrationId = params.studentSubjectRegistrationId.trim();
    }
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subclassId?.trim()) where.subclassId = params.subclassId.trim();
    if (params.subjectId?.trim()) where.subjectId = params.subjectId.trim();
    if (params.componentId?.trim()) where.componentId = params.componentId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.studentId?.trim()) {
      where.studentSubjectRegistration = { studentId: params.studentId.trim() };
    }

    const rows = await this.prisma.studentAssessmentScore.findMany({
      where,
      include,
      orderBy: [{ sessionId: "desc" }, { termId: "asc" }, { classId: "asc" }],
    });
    return { studentAssessmentScores: rows.map(mapRow), count: rows.length };
  }

  async getScoreSheet(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
    subjectId: string;
    componentId: string;
  }): Promise<ScoreSheetResult> {
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    const subjectId = params.subjectId.trim();
    const componentId = params.componentId.trim();
    const subclassId = params.subclassId?.trim();

    if (!classId || !sessionId || !termId || !subjectId || !componentId) {
      throw new Error("classId, sessionId, termId, subjectId, and componentId are required");
    }

    await this.resolveComponent(componentId);

    const registrations = await this.prisma.studentSubjectRegistration.findMany({
      where: {
        classId,
        sessionId,
        termId,
        subjectId,
        ...(subclassId ? { subclassId } : {}),
      },
      select: {
        id: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
    });
    const registrationIds = registrations.map((reg) => reg.id);
    const scores =
      registrationIds.length > 0
        ? await this.prisma.studentAssessmentScore.findMany({
            where: {
              studentSubjectRegistrationId: { in: registrationIds },
              componentId,
            },
            select: { studentSubjectRegistrationId: true, score: true },
          })
        : [];

    const scoreByRegistrationId = new Map(
      scores.map((row) => [row.studentSubjectRegistrationId, row.score])
    );

    return {
      componentId,
      subjectScores: registrations.map((reg) => ({
        studentName: `${reg.student.firstName} ${reg.student.lastName}`,
        studentSubjectRegistrationId: reg.id,
        score: scoreByRegistrationId.has(reg.id)
          ? Number(scoreByRegistrationId.get(reg.id)!.toString())
          : 0,
      })),
    };
  }

  async getStudentSubjectScores(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
    subjectId: string;
  }): Promise<StudentSubjectScoresResult> {
    return this.buildStudentSubjectScoresResult(params);
  }

  async getStudentSubjectScoreReport(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
    subjectId: string;
  }): Promise<StudentSubjectScoreReportResult> {
    const base = await this.buildStudentSubjectScoresResult(params);
    const gradeItems = await this.resolveGradeItems(
      params.classId.trim(),
      params.sessionId.trim(),
      params.termId.trim()
    );
    const positionByStudentId = this.assignPositions(
      base.students.map((student) => ({
        studentId: student.studentId,
        totalScore: student.totalScore,
      }))
    );

    return {
      ...base,
      students: base.students.map((student) => ({
        ...student,
        ...this.resolveGradeForTotalScore(student.totalScore, gradeItems),
        position: positionByStudentId.get(student.studentId) ?? 0,
      })),
    };
  }

  private async buildStudentSubjectScoresResult(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
    subjectId: string;
  }): Promise<StudentSubjectScoresResult> {
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    const subjectId = params.subjectId.trim();
    const subclassId = params.subclassId?.trim();

    if (!classId || !sessionId || !termId || !subjectId) {
      throw new Error("classId, sessionId, termId, and subjectId are required");
    }

    const { template, gradeTemplate, components } = await this.resolveTemplateAndComponents(
      classId,
      sessionId,
      termId
    );
    const componentIds = components.map((component) => component.id);

    const registrations = await this.prisma.studentSubjectRegistration.findMany({
      where: {
        classId,
        sessionId,
        termId,
        subjectId,
        ...(subclassId ? { subclassId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
    });
    const registrationIds = registrations.map((reg) => reg.id);
    const scores =
      registrationIds.length > 0 && componentIds.length > 0
        ? await this.prisma.studentAssessmentScore.findMany({
            where: {
              studentSubjectRegistrationId: { in: registrationIds },
              componentId: { in: componentIds },
            },
            select: {
              studentSubjectRegistrationId: true,
              componentId: true,
              score: true,
            },
          })
        : [];

    const scoreByRegistrationAndComponent = new Map<string, Map<string, Prisma.Decimal>>();
    for (const row of scores) {
      let byComponent = scoreByRegistrationAndComponent.get(row.studentSubjectRegistrationId);
      if (!byComponent) {
        byComponent = new Map();
        scoreByRegistrationAndComponent.set(row.studentSubjectRegistrationId, byComponent);
      }
      byComponent.set(row.componentId, row.score);
    }

    return {
      template,
      gradeTemplate,
      components: components.map((component) => ({
        id: component.id,
        name: component.name,
        shortName: component.shortName,
        maxScore: Number(component.maxScore.toString()),
        rank: component.orderNo,
      })),
      students: registrations.map((reg) => {
        const scoresForStudent = scoreByRegistrationAndComponent.get(reg.id);
        const componentScore = components.map((component) => ({
          componentId: component.id,
          component: component.name,
          shortName: component.shortName,
          maxScore: Number(component.maxScore.toString()),
          score: scoresForStudent?.has(component.id)
            ? Number(scoresForStudent.get(component.id)!.toString())
            : 0,
        }));
        const totalScore = componentScore.reduce((sum, entry) => sum + entry.score, 0);

        return {
          studentId: reg.studentId,
          studentName: `${reg.student.firstName} ${reg.student.lastName}`,
          componentScore,
          totalScore,
        };
      }),
    };
  }

  async getStudentAssessmentReport(params: {
    studentId: string;
    classId: string;
    sessionId: string;
    termId: string;
  }): Promise<StudentAssessmentReportResult> {
    const studentId = params.studentId.trim();
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();

    if (!studentId || !classId || !sessionId || !termId) {
      throw new Error("studentId, classId, sessionId, and termId are required");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, admissionNumber: true, firstName: true, lastName: true },
    });
    if (!student) throw new Error("Invalid studentId");

    const studentRegistrations = await this.prisma.studentSubjectRegistration.findMany({
      where: { studentId, classId, sessionId, termId },
      include: {
        class: { select: { id: true, name: true } },
        subclass: { select: { id: true, name: true } },
        session: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
      orderBy: { subject: { name: "asc" } },
    });
    if (studentRegistrations.length === 0) {
      throw new Error("Student has no subject registrations for the class, session, and term");
    }

    const { components } = await this.resolveTemplateAndComponents(classId, sessionId, termId);
    const gradeItems = await this.resolveGradeItems(classId, sessionId, termId);
    const componentIds = components.map((component) => component.id);

    const classRegistrations = await this.prisma.studentSubjectRegistration.findMany({
      where: { classId, sessionId, termId },
      select: { id: true, studentId: true, subjectId: true },
    });

    const classRegistrationIds = classRegistrations.map((reg) => reg.id);
    const scores =
      classRegistrationIds.length > 0 && componentIds.length > 0
        ? await this.prisma.studentAssessmentScore.findMany({
            where: {
              studentSubjectRegistrationId: { in: classRegistrationIds },
              componentId: { in: componentIds },
            },
            select: {
              studentSubjectRegistrationId: true,
              componentId: true,
              score: true,
            },
          })
        : [];

    const scoreByRegistrationAndComponent = new Map<string, Map<string, Prisma.Decimal>>();
    for (const row of scores) {
      let byComponent = scoreByRegistrationAndComponent.get(row.studentSubjectRegistrationId);
      if (!byComponent) {
        byComponent = new Map();
        scoreByRegistrationAndComponent.set(row.studentSubjectRegistrationId, byComponent);
      }
      byComponent.set(row.componentId, row.score);
    }

    const registrationsBySubject = new Map<string, typeof classRegistrations>();
    for (const reg of classRegistrations) {
      const list = registrationsBySubject.get(reg.subjectId) ?? [];
      list.push(reg);
      registrationsBySubject.set(reg.subjectId, list);
    }

    const firstRegistration = studentRegistrations[0];
    const subjects: StudentAssessmentReportSubject[] = studentRegistrations.map((registration) => {
      const componentScore = this.buildComponentScores(
        registration.id,
        components,
        scoreByRegistrationAndComponent
      );
      const totalScore = this.totalFromComponentScores(componentScore);
      const { grade, remark } = this.resolveGradeForTotalScore(totalScore, gradeItems);

      const subjectClassRegs = registrationsBySubject.get(registration.subjectId) ?? [];
      const totalsByStudent = subjectClassRegs.map((reg) => {
        const peerComponentScore = this.buildComponentScores(
          reg.id,
          components,
          scoreByRegistrationAndComponent
        );
        return {
          studentId: reg.studentId,
          totalScore: this.totalFromComponentScores(peerComponentScore),
        };
      });
      const position =
        this.assignPositions(totalsByStudent).get(studentId) ?? 0;
      const classStats = this.classStatsForTotals(totalsByStudent.map((entry) => entry.totalScore));

      return {
        subjectId: registration.subject.id,
        subjectName: registration.subject.name,
        componentScore,
        totalScore,
        grade,
        remark,
        position,
        ...classStats,
      };
    });

    const overallScore = subjects.reduce((sum, subject) => sum + subject.totalScore, 0);
    const averageScore =
      subjects.length > 0 ? roundScore(overallScore / subjects.length) : 0;

    return {
      admissionNumber: student.admissionNumber,
      studentName: `${student.firstName} ${student.lastName}`,
      consideredClassId: firstRegistration.class.id,
      consideredClass: firstRegistration.class.name,
      ...(firstRegistration.subclass?.name
        ? { consideredSubclass: firstRegistration.subclass.name }
        : {}),
      sessionId: firstRegistration.session.id,
      session: firstRegistration.session.name,
      termId: firstRegistration.term.id,
      term: firstRegistration.term.name,
      subjects,
      overallScore,
      averageScore,
    };
  }

  /**
   * Broadsheet: every student in the class (optionally a subclass) for the given
   * session and term, with each registered subject's total score (summed across
   * all active assessment components) and the grade derived from the class grading
   * template.
   */
  async getBroadsheet(params: {
    classId: string;
    subclassId?: string;
    sessionId: string;
    termId: string;
  }): Promise<BroadsheetStudentEntry[]> {
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    const subclassId = params.subclassId?.trim();

    if (!classId || !sessionId || !termId) {
      throw new Error("classId, sessionId, and termId are required");
    }

    const { components } = await this.resolveTemplateAndComponents(classId, sessionId, termId);
    const gradeItems = await this.resolveGradeItems(classId, sessionId, termId);
    const componentIds = components.map((component) => component.id);

    const registrations = await this.prisma.studentSubjectRegistration.findMany({
      where: {
        classId,
        sessionId,
        termId,
        ...(subclassId ? { subclassId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
        subject: { select: { id: true, name: true } },
      },
      orderBy: [
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
        { subject: { name: "asc" } },
      ],
    });
    if (registrations.length === 0) return [];

    const registrationIds = registrations.map((reg) => reg.id);
    const scores =
      registrationIds.length > 0 && componentIds.length > 0
        ? await this.prisma.studentAssessmentScore.findMany({
            where: {
              studentSubjectRegistrationId: { in: registrationIds },
              componentId: { in: componentIds },
            },
            select: { studentSubjectRegistrationId: true, score: true },
          })
        : [];

    const totalByRegistration = new Map<string, number>();
    for (const row of scores) {
      const previous = totalByRegistration.get(row.studentSubjectRegistrationId) ?? 0;
      totalByRegistration.set(
        row.studentSubjectRegistrationId,
        previous + Number(row.score.toString())
      );
    }

    const studentOrder: string[] = [];
    const studentById = new Map<string, BroadsheetStudentEntry>();
    for (const reg of registrations) {
      let entry = studentById.get(reg.studentId);
      if (!entry) {
        entry = {
          studentId: reg.studentId,
          studentName: `${reg.student.firstName} ${reg.student.lastName}`,
          subjects: [],
        };
        studentById.set(reg.studentId, entry);
        studentOrder.push(reg.studentId);
      }

      const totalScore = roundScore(totalByRegistration.get(reg.id) ?? 0);
      const { grade } = this.resolveGradeForTotalScore(totalScore, gradeItems);
      entry.subjects.push({
        id: reg.subject.id,
        subjectName: reg.subject.name,
        totalScore,
        grade,
      });
    }

    return studentOrder.map((studentId) => studentById.get(studentId)!);
  }

  async getById(id: string): Promise<StudentAssessmentScoreData | null> {
    const row = await this.prisma.studentAssessmentScore.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: { score?: string | number; componentId?: string }
  ): Promise<StudentAssessmentScoreData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student assessment score not found");
    if (existing.component.isLocked) throw new Error("Cannot update score: component is locked");

    const componentId = input.componentId?.trim() || existing.componentId;
    const score =
      input.score !== undefined
        ? parseDecimalNonNegative(input.score, "score")
        : new Prisma.Decimal(existing.score);
    if (input.componentId !== undefined) await this.assertComponent(componentId, score);
    else if (input.score !== undefined) await this.assertComponent(existing.componentId, score);

    try {
      const row = await this.prisma.studentAssessmentScore.update({
        where: { id },
        data: {
          ...(input.score !== undefined ? { score } : {}),
          ...(input.componentId !== undefined ? { componentId } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student assessment score not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("A score already exists for this registration and component");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StudentAssessmentScoreData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student assessment score not found");
    if (existing.component.isLocked) throw new Error("Cannot delete score: component is locked");

    try {
      const row = await this.prisma.studentAssessmentScore.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student assessment score not found");
      }
      throw e;
    }
  }
}

export const studentAssessmentScoreService = new StudentAssessmentScoreService();
