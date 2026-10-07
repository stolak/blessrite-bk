import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  student: {
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true },
  },
  behaviouralAssessmentComponent: {
    select: {
      id: true,
      name: true,
      maxScore: true,
      orderNo: true,
      behaviourTemplateId: true,
      behaviourTemplate: { select: { id: true, name: true, isLocked: true } },
    },
  },
  class: { select: { id: true, name: true, status: true } },
  subclass: { select: { id: true, name: true, status: true } },
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
} satisfies Prisma.StudentBehaviouralAssessmentScoreInclude;

type Row = Prisma.StudentBehaviouralAssessmentScoreGetPayload<{ include: typeof include }>;

export interface StudentBehaviouralAssessmentScoreData {
  id: string;
  studentId: string;
  student: Row["student"];
  behaviouralAssessmentComponentId: string;
  behaviouralAssessmentComponent: Row["behaviouralAssessmentComponent"];
  classId: string;
  class: Row["class"];
  subclassId: string;
  subclass: Row["subclass"];
  sessionId: string;
  session: Row["session"];
  termId: string;
  term: Row["term"];
  score: string;
}

export interface StudentBehaviouralScoreComponentEntry {
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
}

export interface StudentBehaviouralScoresResult {
  studentId: string;
  student: Row["student"];
  score: StudentBehaviouralScoreComponentEntry[];
  classId: string;
  class: { id: string; name: string };
  sessionId: string;
  session: { id: string; name: string };
  termId: string;
  term: { id: string; name: string };
  behaviouralTemplate: { id: string; name: string };
  behaviouralGradingTemplate: { id: string; name: string } | null;
}

type BehaviouralGradeBand = {
  grade: string;
  lowBoundary: Prisma.Decimal;
  highBoundary: Prisma.Decimal;
  remark: string | null;
  gradePoint: Prisma.Decimal;
};

function mapRow(row: Row): StudentBehaviouralAssessmentScoreData {
  return {
    id: row.id,
    studentId: row.studentId,
    student: row.student,
    behaviouralAssessmentComponentId: row.behaviouralAssessmentComponentId,
    behaviouralAssessmentComponent: row.behaviouralAssessmentComponent,
    classId: row.classId,
    class: row.class,
    subclassId: row.subclassId,
    subclass: row.subclass,
    sessionId: row.sessionId,
    session: row.session,
    termId: row.termId,
    term: row.term,
    score: row.score.toString(),
  };
}

type ScoreContext = {
  classId: string;
  subclassId: string;
  sessionId: string;
  termId: string;
};

export class StudentBehaviouralAssessmentScoreService {
  private prisma = prisma;

  private resolveScoreGrade(
    scoreValue: string,
    items: BehaviouralGradeBand[]
  ): { grade: string; remark: string; gradePoint: string } {
    if (items.length === 0) {
      return { grade: "NA", remark: "NA", gradePoint: "NA" };
    }

    const score = new Prisma.Decimal(scoreValue);
    const match = items.find(
      (item) => !score.lessThan(item.lowBoundary) && !score.greaterThan(item.highBoundary)
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

  private async assertContext(input: ScoreContext): Promise<void> {
    const [cls, subclass, session, term] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      this.prisma.subClass.findUnique({
        where: { id: input.subclassId },
        select: { id: true, classId: true },
      }),
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);
    if (!cls) throw new Error("Invalid classId");
    if (!subclass) throw new Error("Invalid subclassId");
    if (subclass.classId !== input.classId) {
      throw new Error("subclassId does not belong to the specified classId");
    }
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
  }

  private async assertRefs(input: {
    studentId: string;
    behaviouralAssessmentComponentId: string;
    score: Prisma.Decimal;
    classId: string;
    subclassId: string;
    sessionId: string;
    termId: string;
  }): Promise<void> {
    const [student, component] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, classId: true, subClassId: true },
      }),
      this.prisma.behaviouralAssessmentComponent.findUnique({
        where: { id: input.behaviouralAssessmentComponentId },
        select: {
          id: true,
          maxScore: true,
          behaviourTemplate: { select: { isLocked: true } },
        },
      }),
    ]);
    if (!student) throw new Error("Invalid studentId");
    if (!component) throw new Error("Invalid behaviouralAssessmentComponentId");
    if (component.behaviourTemplate.isLocked) {
      throw new Error("Cannot record score: behavioural assessment template is locked");
    }
    if (input.score.gt(component.maxScore)) {
      throw new Error(`score cannot exceed component maxScore (${component.maxScore.toString()})`);
    }
    if (student.classId !== input.classId) {
      throw new Error("studentId does not belong to the specified classId");
    }
    await this.assertContext({
      classId: input.classId,
      subclassId: input.subclassId,
      sessionId: input.sessionId,
      termId: input.termId,
    });
  }

  private async assertScoreNotDuplicate(
    studentId: string,
    behaviouralAssessmentComponentId: string,
    classId: string,
    sessionId: string,
    termId: string,
    excludeId?: string
  ): Promise<void> {
    const existing = await this.prisma.studentBehaviouralAssessmentScore.findFirst({
      where: {
        studentId,
        behaviouralAssessmentComponentId,
        classId,
        sessionId,
        termId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        "Student already has a behavioural score for this component in the class, session, and term"
      );
    }
  }

  async create(input: {
    studentId: string;
    behaviouralAssessmentComponentId: string;
    score: string | number;
    classId: string;
    subclassId: string;
    sessionId: string;
    termId: string;
  }): Promise<StudentBehaviouralAssessmentScoreData> {
    const studentId = input.studentId.trim();
    const behaviouralAssessmentComponentId = input.behaviouralAssessmentComponentId.trim();
    const classId = input.classId.trim();
    const subclassId = input.subclassId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    if (!studentId) throw new Error("studentId is required");
    if (!behaviouralAssessmentComponentId) {
      throw new Error("behaviouralAssessmentComponentId is required");
    }
    if (!classId || !subclassId || !sessionId || !termId) {
      throw new Error("classId, subclassId, sessionId, and termId are required");
    }

    const score = parseDecimalNonNegative(input.score, "score");
    await this.assertRefs({
      studentId,
      behaviouralAssessmentComponentId,
      score,
      classId,
      subclassId,
      sessionId,
      termId,
    });
    await this.assertScoreNotDuplicate(
      studentId,
      behaviouralAssessmentComponentId,
      classId,
      sessionId,
      termId
    );

    const row = await this.prisma.studentBehaviouralAssessmentScore.create({
      data: {
        studentId,
        behaviouralAssessmentComponentId,
        score,
        classId,
        subclassId,
        sessionId,
        termId,
      },
      include,
    });
    return mapRow(row);
  }

  async createMany(input: {
    behaviouralAssessmentComponentId: string;
    classId: string;
    sessionId: string;
    termId: string;
    studentScores: { studentId: string; score: string | number; subclassId?: string }[];
  }): Promise<{ studentBehaviouralAssessmentScores: StudentBehaviouralAssessmentScoreData[]; count: number }> {
    const behaviouralAssessmentComponentId = input.behaviouralAssessmentComponentId.trim();
    const classId = input.classId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    if (!behaviouralAssessmentComponentId) {
      throw new Error("behaviouralAssessmentComponentId is required");
    }
    if (!classId || !sessionId || !termId) {
      throw new Error("classId, sessionId, and termId are required");
    }
    if (!Array.isArray(input.studentScores) || input.studentScores.length === 0) {
      throw new Error("studentScores must be a non-empty array");
    }

    const studentScores = input.studentScores.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`studentScores[${index}] must be an object`);
      }
      const studentId = entry.studentId;
      if (typeof studentId !== "string" || !studentId.trim()) {
        throw new Error(`studentScores[${index}].studentId must be a non-empty string`);
      }
      const subclassId = entry.subclassId;
      if (subclassId !== undefined && (typeof subclassId !== "string" || !subclassId.trim())) {
        throw new Error(`studentScores[${index}].subclassId must be a non-empty string`);
      }
      return {
        studentId: studentId.trim(),
        subclassId: subclassId?.trim(),
        score: parseDecimalNonNegative(entry.score, `studentScores[${index}].score`),
      };
    });

    const studentIds = studentScores.map((entry) => entry.studentId);
    const duplicateIds = [...new Set(studentIds.filter((id, index) => studentIds.indexOf(id) !== index))];
    if (duplicateIds.length > 0) {
      throw new Error("Duplicate studentId in request");
    }

    const component = await this.prisma.behaviouralAssessmentComponent.findUnique({
      where: { id: behaviouralAssessmentComponentId },
      select: {
        id: true,
        maxScore: true,
        behaviourTemplate: { select: { isLocked: true } },
      },
    });
    if (!component) throw new Error("Invalid behaviouralAssessmentComponentId");
    if (component.behaviourTemplate.isLocked) {
      throw new Error("Cannot record score: behavioural assessment template is locked");
    }
    for (const entry of studentScores) {
      if (entry.score.gt(component.maxScore)) {
        throw new Error(`score cannot exceed component maxScore (${component.maxScore.toString()})`);
      }
    }

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, classId: true, subClassId: true },
    });
    if (students.length !== studentIds.length) throw new Error("Invalid studentId");

    const studentById = new Map(students.map((student) => [student.id, student]));
    const resolvedScores = studentScores.map((entry, index) => {
      const student = studentById.get(entry.studentId)!;
      if (student.classId !== classId) {
        throw new Error(`studentScores[${index}].studentId does not belong to the specified classId`);
      }
      const subclassId = entry.subclassId ?? student.subClassId;
      if (!subclassId) {
        throw new Error(`studentScores[${index}] requires subclassId (student has no sub-class assigned)`);
      }
      return { ...entry, subclassId };
    });

    const uniqueSubclassIds = [...new Set(resolvedScores.map((entry) => entry.subclassId))];
    const [session, term, subclasses] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
      this.prisma.subClass.findMany({
        where: { id: { in: uniqueSubclassIds } },
        select: { id: true, classId: true },
      }),
    ]);
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (subclasses.length !== uniqueSubclassIds.length) throw new Error("Invalid subclassId");
    if (subclasses.some((subclass) => subclass.classId !== classId)) {
      throw new Error("subclassId does not belong to the specified classId");
    }

    const existing = await this.prisma.studentBehaviouralAssessmentScore.findMany({
      where: {
        behaviouralAssessmentComponentId,
        classId,
        sessionId,
        termId,
        studentId: { in: studentIds },
      },
      select: { id: true, studentId: true },
    });
    const existingByStudent = new Map(existing.map((row) => [row.studentId, row.id]));

    const rows = await this.prisma.$transaction(
      resolvedScores.map((entry) => {
        const existingId = existingByStudent.get(entry.studentId);
        const data = {
          score: entry.score,
          subclassId: entry.subclassId,
        };
        if (existingId) {
          return this.prisma.studentBehaviouralAssessmentScore.update({
            where: { id: existingId },
            data,
            include,
          });
        }
        return this.prisma.studentBehaviouralAssessmentScore.create({
          data: {
            studentId: entry.studentId,
            behaviouralAssessmentComponentId,
            classId,
            sessionId,
            termId,
            ...data,
          },
          include,
        });
      })
    );
    return { studentBehaviouralAssessmentScores: rows.map(mapRow), count: rows.length };
  }

  async upsertBulkForStudent(input: {
    studentId: string;
    classId: string;
    sessionId: string;
    termId: string;
    behaviouralScores: { behaviouralAssessmentComponentId: string; score: string | number }[];
  }): Promise<{ studentBehaviouralAssessmentScores: StudentBehaviouralAssessmentScoreData[]; count: number }> {
    const studentId = input.studentId.trim();
    const classId = input.classId.trim();
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    if (!studentId) throw new Error("studentId is required");
    if (!classId || !sessionId || !termId) {
      throw new Error("classId, sessionId, and termId are required");
    }
    if (!Array.isArray(input.behaviouralScores) || input.behaviouralScores.length === 0) {
      throw new Error("behaviouralScores must be a non-empty array");
    }

    const behaviouralScores = input.behaviouralScores.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`behaviouralScores[${index}] must be an object`);
      }
      const behaviouralAssessmentComponentId = entry.behaviouralAssessmentComponentId;
      if (
        typeof behaviouralAssessmentComponentId !== "string" ||
        !behaviouralAssessmentComponentId.trim()
      ) {
        throw new Error(
          `behaviouralScores[${index}].behaviouralAssessmentComponentId must be a non-empty string`
        );
      }
      return {
        behaviouralAssessmentComponentId: behaviouralAssessmentComponentId.trim(),
        score: parseDecimalNonNegative(entry.score, `behaviouralScores[${index}].score`),
      };
    });

    const componentIds = behaviouralScores.map((entry) => entry.behaviouralAssessmentComponentId);
    const duplicateComponentIds = [
      ...new Set(componentIds.filter((id, index) => componentIds.indexOf(id) !== index)),
    ];
    if (duplicateComponentIds.length > 0) {
      throw new Error("Duplicate behaviouralAssessmentComponentId in request");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, classId: true, subClassId: true },
    });
    if (!student) throw new Error("Invalid studentId");
    if (student.classId !== classId) {
      throw new Error("studentId does not belong to the specified classId");
    }
    if (!student.subClassId) {
      throw new Error("student has no sub-class assigned; cannot record behavioural scores");
    }

    await this.assertContext({
      classId,
      subclassId: student.subClassId,
      sessionId,
      termId,
    });

    const components = await this.prisma.behaviouralAssessmentComponent.findMany({
      where: { id: { in: componentIds } },
      select: {
        id: true,
        name: true,
        maxScore: true,
        behaviourTemplate: { select: { isLocked: true } },
      },
    });
    if (components.length !== componentIds.length) {
      throw new Error("Invalid behaviouralAssessmentComponentId");
    }

    const componentById = new Map(components.map((component) => [component.id, component]));
    for (const entry of behaviouralScores) {
      const component = componentById.get(entry.behaviouralAssessmentComponentId)!;
      if (component.behaviourTemplate.isLocked) {
        throw new Error("Cannot record score: behavioural assessment template is locked");
      }
      if (entry.score.gt(component.maxScore)) {
        throw new Error(
          `score for ${component.name} cannot exceed component maxScore (${component.maxScore.toString()})`
        );
      }
    }

    const existing = await this.prisma.studentBehaviouralAssessmentScore.findMany({
      where: {
        studentId,
        classId,
        sessionId,
        termId,
        behaviouralAssessmentComponentId: { in: componentIds },
      },
      select: { id: true, behaviouralAssessmentComponentId: true },
    });
    const existingByComponent = new Map(
      existing.map((row) => [row.behaviouralAssessmentComponentId, row.id])
    );

    const rows = await this.prisma.$transaction(
      behaviouralScores.map((entry) => {
        const existingId = existingByComponent.get(entry.behaviouralAssessmentComponentId);
        if (existingId) {
          return this.prisma.studentBehaviouralAssessmentScore.update({
            where: { id: existingId },
            data: { score: entry.score },
            include,
          });
        }
        return this.prisma.studentBehaviouralAssessmentScore.create({
          data: {
            studentId,
            behaviouralAssessmentComponentId: entry.behaviouralAssessmentComponentId,
            classId,
            subclassId: student.subClassId!,
            sessionId,
            termId,
            score: entry.score,
          },
          include,
        });
      })
    );
    return { studentBehaviouralAssessmentScores: rows.map(mapRow), count: rows.length };
  }

  private async resolveBehaviouralAssignment(classId: string, sessionId: string, termId: string) {
    const assignment = await this.prisma.classAssessmentTemplate.findFirst({
      where: {
        classId,
        sessionId,
        termId,
        behaviouralTemplateId: { not: null },
      },
      select: {
        behaviouralTemplate: {
          select: {
            id: true,
            name: true,
            behaviouralAssessmentComponents: {
              where: { status: "Active" },
              select: { id: true, name: true, maxScore: true, orderNo: true },
              orderBy: { orderNo: "asc" },
            },
          },
        },
        behaviouralGradingTemplate: {
          select: {
            id: true,
            name: true,
            gradingItems: {
              select: {
                grade: true,
                lowBoundary: true,
                highBoundary: true,
                remark: true,
                gradePoint: true,
              },
              orderBy: { lowBoundary: "desc" },
            },
          },
        },
      },
    });
    if (!assignment?.behaviouralTemplate) {
      throw new Error(
        "No behavioural assessment template assigned to this class for the session and term"
      );
    }
    return {
      template: {
        id: assignment.behaviouralTemplate.id,
        name: assignment.behaviouralTemplate.name,
      },
      components: assignment.behaviouralTemplate.behaviouralAssessmentComponents,
      gradeTemplate: assignment.behaviouralGradingTemplate
        ? {
            id: assignment.behaviouralGradingTemplate.id,
            name: assignment.behaviouralGradingTemplate.name,
          }
        : null,
      gradingItems: assignment.behaviouralGradingTemplate?.gradingItems ?? [],
    };
  }

  async getStudentBehaviouralScores(params: {
    studentId: string;
    classId: string;
    sessionId: string;
    termId: string;
  }): Promise<StudentBehaviouralScoresResult> {
    const studentId = params.studentId.trim();
    const classId = params.classId.trim();
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    if (!studentId || !classId || !sessionId || !termId) {
      throw new Error("studentId, classId, sessionId, and termId are required");
    }

    const [student, cls, session, term, assignment] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          classId: true,
        },
      }),
      this.prisma.schoolClass.findUnique({
        where: { id: classId },
        select: { id: true, name: true },
      }),
      this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true },
      }),
      this.prisma.term.findUnique({
        where: { id: termId },
        select: { id: true, name: true },
      }),
      this.resolveBehaviouralAssignment(classId, sessionId, termId),
    ]);

    const { template, components, gradeTemplate, gradingItems } = assignment;

    if (!student) throw new Error("Invalid studentId");
    if (!cls) throw new Error("Invalid classId");
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");

    const componentIds = components.map((component) => component.id);
    const existingScores =
      componentIds.length > 0
        ? await this.prisma.studentBehaviouralAssessmentScore.findMany({
            where: {
              studentId,
              classId,
              sessionId,
              termId,
              behaviouralAssessmentComponentId: { in: componentIds },
            },
            select: { behaviouralAssessmentComponentId: true, score: true },
          })
        : [];

    const scoreByComponentId = new Map(
      existingScores.map((row) => [row.behaviouralAssessmentComponentId, row.score.toString()])
    );

    return {
      studentId: student.id,
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
      },
      score: components.map((component) => {
        const scoreValue = scoreByComponentId.get(component.id) ?? "0";
        return {
          score: scoreValue,
          scoreGrade: this.resolveScoreGrade(scoreValue, gradingItems),
          behaviouralAssessmentComponent: {
            id: component.id,
            name: component.name,
            maxScore: component.maxScore.toString(),
            orderNo: component.orderNo,
          },
        };
      }),
      classId: cls.id,
      class: { id: cls.id, name: cls.name },
      sessionId: session.id,
      session: { id: session.id, name: session.name },
      termId: term.id,
      term: { id: term.id, name: term.name },
      behaviouralTemplate: template,
      behaviouralGradingTemplate: gradeTemplate,
    };
  }

  async list(params: {
    studentId?: string;
    behaviouralAssessmentComponentId?: string;
    behaviourTemplateId?: string;
    classId?: string;
    subclassId?: string;
    sessionId?: string;
    termId?: string;
  }) {
    const where: Prisma.StudentBehaviouralAssessmentScoreWhereInput = {};
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.behaviouralAssessmentComponentId?.trim()) {
      where.behaviouralAssessmentComponentId = params.behaviouralAssessmentComponentId.trim();
    }
    if (params.classId?.trim()) where.classId = params.classId.trim();
    if (params.subclassId?.trim()) where.subclassId = params.subclassId.trim();
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.behaviourTemplateId?.trim()) {
      where.behaviouralAssessmentComponent = {
        behaviourTemplateId: params.behaviourTemplateId.trim(),
      };
    }

    const rows = await this.prisma.studentBehaviouralAssessmentScore.findMany({
      where,
      include,
      orderBy: [
        { sessionId: "desc" },
        { termId: "asc" },
        { classId: "asc" },
        { studentId: "asc" },
        { behaviouralAssessmentComponentId: "asc" },
      ],
    });
    return { studentBehaviouralAssessmentScores: rows.map(mapRow), count: rows.length };
  }

  async getById(id: string): Promise<StudentBehaviouralAssessmentScoreData | null> {
    const row = await this.prisma.studentBehaviouralAssessmentScore.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      score?: string | number;
      behaviouralAssessmentComponentId?: string;
      classId?: string;
      subclassId?: string;
      sessionId?: string;
      termId?: string;
    }
  ): Promise<StudentBehaviouralAssessmentScoreData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student behavioural assessment score not found");
    if (existing.behaviouralAssessmentComponent.behaviourTemplate.isLocked) {
      throw new Error("Cannot update score: behavioural assessment template is locked");
    }

    const behaviouralAssessmentComponentId =
      input.behaviouralAssessmentComponentId?.trim() ||
      existing.behaviouralAssessmentComponentId;
    const classId = input.classId?.trim() || existing.classId;
    const subclassId = input.subclassId?.trim() || existing.subclassId;
    const sessionId = input.sessionId?.trim() || existing.sessionId;
    const termId = input.termId?.trim() || existing.termId;
    const score =
      input.score !== undefined
        ? parseDecimalNonNegative(input.score, "score")
        : new Prisma.Decimal(existing.score);

    await this.assertRefs({
      studentId: existing.studentId,
      behaviouralAssessmentComponentId,
      score,
      classId,
      subclassId,
      sessionId,
      termId,
    });
    if (
      input.behaviouralAssessmentComponentId !== undefined ||
      input.classId !== undefined ||
      input.sessionId !== undefined ||
      input.termId !== undefined
    ) {
      await this.assertScoreNotDuplicate(
        existing.studentId,
        behaviouralAssessmentComponentId,
        classId,
        sessionId,
        termId,
        id
      );
    }

    try {
      const row = await this.prisma.studentBehaviouralAssessmentScore.update({
        where: { id },
        data: {
          ...(input.score !== undefined ? { score } : {}),
          ...(input.behaviouralAssessmentComponentId !== undefined
            ? { behaviouralAssessmentComponentId }
            : {}),
          ...(input.classId !== undefined ? { classId } : {}),
          ...(input.subclassId !== undefined ? { subclassId } : {}),
          ...(input.sessionId !== undefined ? { sessionId } : {}),
          ...(input.termId !== undefined ? { termId } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student behavioural assessment score not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StudentBehaviouralAssessmentScoreData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student behavioural assessment score not found");
    if (existing.behaviouralAssessmentComponent.behaviourTemplate.isLocked) {
      throw new Error("Cannot delete score: behavioural assessment template is locked");
    }
    try {
      const row = await this.prisma.studentBehaviouralAssessmentScore.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student behavioural assessment score not found");
      }
      throw e;
    }
  }
}

export const studentBehaviouralAssessmentScoreService = new StudentBehaviouralAssessmentScoreService();
