import { Prisma, StudentBillingStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { generateReferenceNo } from "../utils/referenceNo";
import { accountTransactionService } from "./accountTransactionService";
import { emailService } from "./emailService";
import { defaultAccountSettingsService } from "./defaultAccountSettingsService";

export type StudentBillingRow = Prisma.StudentBillingGetPayload<Record<string, never>>;

export interface ListStudentBillingsParams {
  studentId?: string;
  classId?: string;
  subclassId?: string;
  session?: string;
  term?: string;
  billingId?: number;
  status?: StudentBillingStatus;
  referentId?: string;
  isPosted?: boolean;
  page?: number;
  limit?: number;
}

export interface ListCombinedStudentBillingDiscountParams {
  studentId: string;
  sessionId?: string;
  termId?: string;
  status?: StudentBillingStatus;
}

const billingListInclude = {
  billing: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} satisfies Prisma.StudentBillingInclude;

const concessionListInclude = {
  concessionDiscount: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} satisfies Prisma.StudentConcessionDiscountInclude;

export type StudentBillingListRow = Prisma.StudentBillingGetPayload<{
  include: typeof billingListInclude;
}>;

export type StudentConcessionDiscountListRow = Prisma.StudentConcessionDiscountGetPayload<{
  include: typeof concessionListInclude;
}>;

export interface StudentBillingDiscountReportParams {
  session?: string;
  term?: string;
  classId?: string;
  subclassId?: string;
}

export interface StudentBillingDiscountReportRow {
  studentId: string;
  session: string;
  term: string;
  classId: string | null;
  subclassId: string | null;
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
  } | null;
  sessionInfo: { id: string; name: string } | null;
  termInfo: { id: string; name: string } | null;
  classInfo: { id: string; name: string } | null;
  subclassInfo: { id: string; name: string } | null;
  approvedBillingTotal: number;
  draftBillingTotal: number;
  approvedDiscountTotal: number;
  draftDiscountTotal: number;
}

export interface StudentWithoutBillingReportRow {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  classId: string | null;
  subclassId: string | null;
  classInfo: { id: string; name: string } | null;
  subclassInfo: { id: string; name: string } | null;
  session: string | null;
  term: string | null;
}

export interface StudentBillingDiscountPeriod {
  sessionId: string;
  session: string | null;
  termId: string;
  term: string | null;
  classId: string | null;
  class: string | null;
  subclassId: string | null;
  subclass: string | null;
}

type CreateStudentBillingInput = {
  studentId: string;
  classId: string;
  subclassId?: string | null;
  session: string;
  term: string;
  billingId: number;
  amount: number;
  referentId?: string | null;
  createdBy: string;
};

type UpdateStudentBillingInput = {
  studentId?: string;
  classId?: string;
  subclassId?: string | null;
  session?: string;
  term?: string;
  billingId?: number;
  amount?: number;
  referentId?: string | null;
  status?: StudentBillingStatus;
  createdBy?: string | null;
  isPosted?: boolean;
};

type CreateManyStudentBillingInput = {
  studentId: string;
  classId: string;
  subclassId?: string | null;
  session: string;
  term: string;
  referentId?: string | null;
  createdBy: string;
  entries: Array<{ billingId: number; amount: number }>;
};

type BulkUpdateStudentBillingStatusInput = {
  ids: number[];
  status: StudentBillingStatus;
  actedBy: string;
};

type BulkPostStudentBillingInput = {
  ids: number[];
  actedBy: string;
};

export type ParentPeriodBillNotificationInput = {
  studentId: string;
  classId: string;
  subclassId?: string;
  sessionId: string;
  termId: string;
};

export type ParentPeriodBillNotificationResult = {
  studentId: string;
  guardianEmail: string | null;
  sent: boolean;
  reason?: string;
  messageId?: string;
  summary: {
    sessionId: string;
    termId: string;
    classId: string;
    subclassId: string | null;
    billingCount: number;
    discountCount: number;
    totalBilling: number;
    totalDiscount: number;
    netPayable: number;
  };
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class StudentBillingService {
  private prisma = prisma;

  private toNumber(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof value === "object" && value !== null && "toString" in value) {
      const n = Number.parseFloat(String(value));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} is required`);
    }
    return trimmed;
  }

  private normalizeOptionalString(value?: string | null): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeReferentId(value?: string | null): string {
    const normalized = this.normalizeOptionalString(value);
    if (normalized === undefined || normalized === null) {
      return generateReferenceNo("STB");
    }
    return normalized;
  }

  private validateBillingId(billingId: number): void {
    if (!Number.isInteger(billingId) || billingId < 1) {
      throw new Error("billingId must be a positive integer");
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("amount must be a valid number greater than or equal to 0");
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async create(input: CreateStudentBillingInput): Promise<StudentBillingRow> {
    this.validateBillingId(input.billingId);
    this.validateAmount(input.amount);

    return this.prisma.studentBilling.create({
      data: {
        studentId: this.normalizeRequiredString(input.studentId, "studentId"),
        classId: this.normalizeRequiredString(input.classId, "classId"),
        subclassId: this.normalizeOptionalString(input.subclassId),
        session: this.normalizeRequiredString(input.session, "session"),
        term: this.normalizeRequiredString(input.term, "term"),
        billingId: input.billingId,
        amount: input.amount,
        referentId: this.normalizeReferentId(input.referentId),
        status: StudentBillingStatus.DRAFT,
        createdBy: this.normalizeRequiredString(input.createdBy, "createdBy"),
        // On creation these fields must always be null/false by business rule.
        approvedBy: null,
        approvedAt: null,
        postedBy: null,
        postedAt: null,
        isPosted: false,
      },
    });
  }

  async createMany(input: CreateManyStudentBillingInput): Promise<{
    referentId: string;
    count: number;
    rows: StudentBillingRow[];
  }> {
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      throw new Error("entries must be a non-empty array");
    }

    const referentId = this.normalizeReferentId(input.referentId);
    const studentId = this.normalizeRequiredString(input.studentId, "studentId");
    const classId = this.normalizeRequiredString(input.classId, "classId");
    const subclassId = this.normalizeOptionalString(input.subclassId);
    const session = this.normalizeRequiredString(input.session, "session");
    const term = this.normalizeRequiredString(input.term, "term");
    const createdBy = this.normalizeRequiredString(input.createdBy, "createdBy");

    const rows = await this.prisma.$transaction(
      input.entries.map((entry) => {
        this.validateBillingId(entry.billingId);
        this.validateAmount(entry.amount);
        return this.prisma.studentBilling.create({
          data: {
            studentId,
            classId,
            subclassId,
            session,
            term,
            billingId: entry.billingId,
            amount: entry.amount,
            referentId,
            status: StudentBillingStatus.DRAFT,
            createdBy,
            // On creation these fields must always be null/false by business rule.
            approvedBy: null,
            approvedAt: null,
            postedBy: null,
            postedAt: null,
            isPosted: false,
          },
        });
      })
    );

    return { referentId, count: rows.length, rows };
  }

  async list(params: ListStudentBillingsParams = {}): Promise<{
    studentBillings: StudentBillingRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StudentBillingWhereInput = {};

    if (params.studentId !== undefined) where.studentId = params.studentId;
    if (params.classId !== undefined) where.classId = params.classId;
    if (params.subclassId !== undefined) where.subclassId = params.subclassId;
    if (params.session !== undefined) where.session = params.session;
    if (params.term !== undefined) where.term = params.term;
    if (params.billingId !== undefined) where.billingId = params.billingId;
    if (params.status !== undefined) where.status = params.status;
    if (params.referentId !== undefined) where.referentId = params.referentId;
    if (params.isPosted !== undefined) where.isPosted = params.isPosted;

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.studentBilling.count({ where: finalWhere }),
      this.prisma.studentBilling.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: billingListInclude,
        skip,
        take: limit,
      }),
    ]);

    return {
      studentBillings: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listCombinedWithConcessionDiscounts(
    params: ListCombinedStudentBillingDiscountParams
  ): Promise<{
    studentBillings: StudentBillingListRow[];
    studentConcessionDiscounts: StudentConcessionDiscountListRow[];
  }> {
    const studentId = this.normalizeRequiredString(params.studentId, "studentId");
    const sessionId = params.sessionId?.trim() || undefined;
    const termId = params.termId?.trim() || undefined;

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) {
      throw new Error("Student not found");
    }

    const billingWhere: Prisma.StudentBillingWhereInput = { studentId };
    const discountWhere: Prisma.StudentConcessionDiscountWhereInput = { studentId };
    if (sessionId) {
      billingWhere.session = sessionId;
      discountWhere.session = sessionId;
    }
    if (termId) {
      billingWhere.term = termId;
      discountWhere.term = termId;
    }
    if (params.status !== undefined) {
      billingWhere.status = params.status;
      discountWhere.status = params.status;
    }

    const [studentBillings, studentConcessionDiscounts] = await Promise.all([
      this.prisma.studentBilling.findMany({
        where: billingWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: billingListInclude,
      }),
      this.prisma.studentConcessionDiscount.findMany({
        where: discountWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: concessionListInclude,
      }),
    ]);

    return { studentBillings, studentConcessionDiscounts };
  }

  async getById(id: number): Promise<StudentBillingRow | null> {
    return this.prisma.studentBilling.findUnique({ where: { id } });
  }

  async billingDiscountReport(
    params: StudentBillingDiscountReportParams = {}
  ): Promise<StudentBillingDiscountReportRow[]> {
    const session = params.session?.trim();
    const term = params.term?.trim();
    const classId = params.classId?.trim();
    const subclassId = params.subclassId?.trim();

    const buildWhere = (alias: string): Prisma.Sql => {
      const clauses: Prisma.Sql[] = [];
      if (session) clauses.push(Prisma.sql`${Prisma.raw(`${alias}.session`)} = ${session}`);
      if (term) clauses.push(Prisma.sql`${Prisma.raw(`${alias}.term`)} = ${term}`);
      if (classId) clauses.push(Prisma.sql`${Prisma.raw(`${alias}.class_id`)} = ${classId}`);
      if (subclassId)
        clauses.push(Prisma.sql`${Prisma.raw(`${alias}.subclass_id`)} = ${subclassId}`);
      if (clauses.length === 0) return Prisma.empty;
      return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
    };

    const rows = await this.prisma.$queryRaw<
      Array<{
        student_id: string;
        session_id: string;
        term_id: string;
        class_id: string | null;
        subclass_id: string | null;
        admission_number: string | null;
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
        session_name: string | null;
        term_name: string | null;
        class_name: string | null;
        subclass_name: string | null;
        approved_billing_total: unknown;
        draft_billing_total: unknown;
        approved_discount_total: unknown;
        draft_discount_total: unknown;
      }>
    >(Prisma.sql`
      SELECT
        k.student_id,
        k.session AS session_id,
        k.term AS term_id,
        k.class_id,
        k.subclass_id,
        st.admission_number,
        st.first_name,
        st.middle_name,
        st.last_name,
        se.name AS session_name,
        te.name AS term_name,
        sc.name AS class_name,
        sbc.name AS subclass_name,
        COALESCE(b.approved_billing_total, 0) AS approved_billing_total,
        COALESCE(b.draft_billing_total, 0) AS draft_billing_total,
        COALESCE(d.approved_discount_total, 0) AS approved_discount_total,
        COALESCE(d.draft_discount_total, 0) AS draft_discount_total
      FROM (
        SELECT
          x.student_id,
          x.session,
          x.term,
          MIN(x.class_id) AS class_id,
          MIN(x.subclass_id) AS subclass_id
        FROM (
          SELECT sb.student_id, sb.session, sb.term, sb.class_id, sb.subclass_id
          FROM student_billings sb
          ${buildWhere("sb")}

          UNION ALL

          SELECT sd.student_id, sd.session, sd.term, sd.class_id, sd.subclass_id
          FROM student_concession_discounts sd
          ${buildWhere("sd")}
        ) x
        GROUP BY x.student_id, x.session, x.term
      ) k
      LEFT JOIN (
        SELECT
          sb.student_id,
          sb.session,
          sb.term,
          SUM(CASE WHEN sb.status = 'APPROVED' THEN sb.amount ELSE 0 END) AS approved_billing_total,
          SUM(CASE WHEN sb.status = 'DRAFT' THEN sb.amount ELSE 0 END) AS draft_billing_total
        FROM student_billings sb
        ${buildWhere("sb")}
        GROUP BY sb.student_id, sb.session, sb.term
      ) b
        ON b.student_id = k.student_id
       AND b.session = k.session
       AND b.term = k.term
      LEFT JOIN (
        SELECT
          sd.student_id,
          sd.session,
          sd.term,
          SUM(CASE WHEN sd.status = 'APPROVED' THEN sd.amount ELSE 0 END) AS approved_discount_total,
          SUM(CASE WHEN sd.status = 'DRAFT' THEN sd.amount ELSE 0 END) AS draft_discount_total
        FROM student_concession_discounts sd
        ${buildWhere("sd")}
        GROUP BY sd.student_id, sd.session, sd.term
      ) d
        ON d.student_id = k.student_id
       AND d.session = k.session
       AND d.term = k.term
      LEFT JOIN students st ON st.id = k.student_id
      LEFT JOIN sessions se ON se.id = k.session
      LEFT JOIN terms te ON te.id = k.term
      LEFT JOIN school_classes sc ON sc.id = k.class_id
      LEFT JOIN sub_classes sbc ON sbc.id = k.subclass_id
      ORDER BY k.session ASC, k.term ASC, k.class_id ASC, k.subclass_id ASC, k.student_id ASC
    `);

    return rows.map((r) => ({
      studentId: r.student_id,
      session: r.session_id,
      term: r.term_id,
      classId: r.class_id,
      subclassId: r.subclass_id,
      student:
        r.admission_number && r.first_name && r.last_name
          ? {
              id: r.student_id,
              admissionNumber: r.admission_number,
              firstName: r.first_name,
              middleName: r.middle_name,
              lastName: r.last_name,
            }
          : null,
      sessionInfo: r.session_name ? { id: r.session_id, name: r.session_name } : null,
      termInfo: r.term_name ? { id: r.term_id, name: r.term_name } : null,
      classInfo: r.class_id && r.class_name ? { id: r.class_id, name: r.class_name } : null,
      subclassInfo:
        r.subclass_id && r.subclass_name ? { id: r.subclass_id, name: r.subclass_name } : null,
      approvedBillingTotal: this.toNumber(r.approved_billing_total),
      draftBillingTotal: this.toNumber(r.draft_billing_total),
      approvedDiscountTotal: this.toNumber(r.approved_discount_total),
      draftDiscountTotal: this.toNumber(r.draft_discount_total),
    }));
  }

  async listStudentBillingDiscountPeriods(
    studentId: string
  ): Promise<StudentBillingDiscountPeriod[]> {
    const normalizedStudentId = this.normalizeRequiredString(studentId, "studentId");

    const student = await this.prisma.student.findUnique({
      where: { id: normalizedStudentId },
      select: { id: true },
    });
    if (!student) {
      throw new Error("Student not found");
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        session_id: string;
        session_name: string | null;
        term_id: string;
        term_name: string | null;
        class_id: string | null;
        class_name: string | null;
        subclass_id: string | null;
        subclass_name: string | null;
      }>
    >(Prisma.sql`
      SELECT DISTINCT
        k.session AS session_id,
        se.name AS session_name,
        k.term AS term_id,
        te.name AS term_name,
        k.class_id,
        sc.name AS class_name,
        k.subclass_id,
        sbc.name AS subclass_name
      FROM (
        SELECT sb.session, sb.term, sb.class_id, sb.subclass_id
        FROM student_billings sb
        WHERE sb.student_id = ${normalizedStudentId}

        UNION

        SELECT sd.session, sd.term, sd.class_id, sd.subclass_id
        FROM student_concession_discounts sd
        WHERE sd.student_id = ${normalizedStudentId}
      ) k
      LEFT JOIN sessions se ON se.id = k.session
      LEFT JOIN terms te ON te.id = k.term
      LEFT JOIN school_classes sc ON sc.id = k.class_id
      LEFT JOIN sub_classes sbc ON sbc.id = k.subclass_id
      ORDER BY k.session DESC, k.term DESC, k.class_id ASC, k.subclass_id ASC
    `);

    return rows.map((row) => ({
      sessionId: row.session_id,
      session: row.session_name,
      termId: row.term_id,
      term: row.term_name,
      classId: row.class_id,
      class: row.class_name,
      subclassId: row.subclass_id,
      subclass: row.subclass_name,
    }));
  }

  // TODO: Implement this function and fix the type errors
  async studentsWithoutBillingReport(
    params: StudentBillingDiscountReportParams = {}
  ): Promise<StudentWithoutBillingReportRow[]> {
    const session = params.session?.trim() || undefined;
    const term = params.term?.trim() || undefined;
    const classId = params.classId?.trim() || undefined;
    const subclassId = params.subclassId?.trim() || undefined;

    const where: Prisma.StudentWhereInput = {};
    if (classId) where.classId = classId;
    if (subclassId) where.subClassId = subclassId;

    const billingWhere: Prisma.StudentBillingWhereInput = {};
    if (session) billingWhere.session = session;
    if (term) billingWhere.term = term;
    where.studentBillings = { none: billingWhere };

    const rows = await this.prisma.student.findMany({
      where,
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        classId: true,
        subClassId: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        subClass: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ classId: "asc" }, { subClassId: "asc" }, { admissionNumber: "asc" }],
    });

    return rows.map((row) => ({
      studentId: row.id,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      classId: row.classId,
      subclassId: row.subClassId,
      classInfo: row.class ? { id: row.class.id, name: row.class.name } : null,
      subclassInfo: row.subClass ? { id: row.subClass.id, name: row.subClass.name } : null,
      session: session ?? null,
      term: term ?? null,
    }));
  }

  async update(id: number, input: UpdateStudentBillingInput): Promise<StudentBillingRow> {
    if (input.billingId !== undefined) this.validateBillingId(input.billingId);
    if (input.amount !== undefined) this.validateAmount(input.amount);

    const data: Prisma.StudentBillingUncheckedUpdateInput = {};
    if (input.studentId !== undefined) {
      data.studentId = this.normalizeRequiredString(input.studentId, "studentId");
    }
    if (input.classId !== undefined) {
      data.classId = this.normalizeRequiredString(input.classId, "classId");
    }
    if (input.subclassId !== undefined) {
      data.subclassId = this.normalizeOptionalString(input.subclassId);
    }
    if (input.session !== undefined) {
      data.session = this.normalizeRequiredString(input.session, "session");
    }
    if (input.term !== undefined) {
      data.term = this.normalizeRequiredString(input.term, "term");
    }
    if (input.billingId !== undefined) {
      data.billingId = input.billingId;
    }
    if (input.amount !== undefined) {
      data.amount = input.amount;
    }
    if (input.referentId !== undefined) {
      data.referentId = this.normalizeOptionalString(input.referentId);
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.createdBy !== undefined) {
      data.createdBy = this.normalizeOptionalString(input.createdBy);
    }
    if (input.isPosted !== undefined) {
      data.isPosted = input.isPosted;
    }

    return this.prisma.studentBilling.update({
      where: { id },
      data,
    });
  }

  async updateStatusMany(input: BulkUpdateStudentBillingStatusInput): Promise<{ count: number }> {
    if (!Array.isArray(input.ids) || input.ids.length === 0) {
      throw new Error("ids must be a non-empty array");
    }
    if (
      input.status !== StudentBillingStatus.DRAFT &&
      input.status !== StudentBillingStatus.APPROVED
    ) {
      throw new Error("status must be APPROVED or DRAFT");
    }

    const ids = [...new Set(input.ids)];
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new Error("ids must contain only positive integers");
    }
    const actedBy = this.normalizeRequiredString(input.actedBy, "actedBy");

    if (input.status === StudentBillingStatus.DRAFT) {
      const postedCount = await this.prisma.studentBilling.count({
        where: {
          id: { in: ids },
          isPosted: true,
        },
      });
      if (postedCount > 0) {
        throw new Error("Posted records cannot be changed to DRAFT");
      }
    }

    const data: Prisma.StudentBillingUncheckedUpdateManyInput =
      input.status === StudentBillingStatus.APPROVED
        ? {
            status: StudentBillingStatus.APPROVED,
            approvedBy: actedBy,
            approvedAt: new Date(),
          }
        : {
            status: StudentBillingStatus.DRAFT,
            approvedBy: null,
            approvedAt: null,
          };

    return this.prisma.studentBilling.updateMany({
      where: { id: { in: ids } },
      data,
    });
  }

  async postMany(input: BulkPostStudentBillingInput): Promise<{ count: number }> {
    const studentReceivableAccountId =
      await defaultAccountSettingsService.getAccountChartBySettingsId("STUDENT_ACCOUNT");
    if (!studentReceivableAccountId.accountId) {
      throw new Error(
        "Student receivable account chart is required before posting student billings contact the system administrator"
      );
    }
    if (!Array.isArray(input.ids) || input.ids.length === 0) {
      throw new Error("ids must be a non-empty array");
    }
    const ids = [...new Set(input.ids)];
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new Error("ids must contain only positive integers");
    }
    const actedBy = this.normalizeRequiredString(input.actedBy, "actedBy");

    const nonApprovedCount = await this.prisma.studentBilling.count({
      where: {
        id: { in: ids },
        status: { not: StudentBillingStatus.APPROVED },
      },
    });
    if (nonApprovedCount > 0) {
      throw new Error("Only APPROVED records can be posted");
    }

    return this.prisma.$transaction(async (tx) => {
      const toPost = await tx.studentBilling.findMany({
        where: {
          id: { in: ids },
          isPosted: false,
        },
        select: {
          id: true,
          studentId: true,
          billingId: true,
          amount: true,
          referentId: true,
          billing: {
            select: {
              name: true,
            },
          },
        },
      });

      if (toPost.length === 0) {
        return { count: 0 };
      }

      const students = await tx.student.findMany({
        where: {
          id: { in: [...new Set(toPost.map((row) => row.studentId))] },
        },
        select: {
          id: true,
          accountId: true,
        },
      });
      const studentAccountById = new Map(students.map((s) => [s.id, s.accountId]));

      const billingItems = await tx.billingItem.findMany({
        where: {
          id: { in: [...new Set(toPost.map((row) => row.billingId))] },
        },
        select: {
          id: true,
          accountId: true,
        },
      });
      const billingAccountById = new Map(billingItems.map((b) => [b.id, b.accountId]));

      const postedAt = new Date();

      for (const row of toPost) {
        const billingAccountId = billingAccountById.get(row.billingId);
        if (!billingAccountId) {
          throw new Error(
            `Billing item account chart is required before posting billing ID ${row.id}`
          );
        }

        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(
            `Billing amount must be a positive number for billing ID ${row.id} - ${row.billing?.name}`
          );
        }

        const reference = row.referentId?.trim() || `STB-${row.id}`;
        const manualReference = `STB-${row.id}`;
        const transactionDate = postedAt.toISOString();
        const remarks = `Student billing for ${row?.billing?.name || row.billingId}`;

        await accountTransactionService.debitAccount(
          {
            accountId: String(studentReceivableAccountId.accountId),
            amount,
            ref: reference,
            manualRef: manualReference,
            accountSub: row?.studentId,
            transactionDate,
            postedBy: actedBy,
            remarks,
          },
          tx
        );

        await accountTransactionService.creditAccount(
          {
            accountId: String(billingAccountId),
            amount,
            ref: reference,
            manualRef: manualReference,
            // accountSub: row?.studentId,
            transactionDate,
            postedBy: actedBy,
            remarks,
          },
          tx
        );
      }

      return tx.studentBilling.updateMany({
        where: {
          id: { in: toPost.map((row) => row.id) },
          isPosted: false,
        },
        data: {
          isPosted: true,
          postedBy: actedBy,
          postedAt,
        },
      });
    });
  }

  async notifyParentPeriodBill(
    input: ParentPeriodBillNotificationInput
  ): Promise<ParentPeriodBillNotificationResult> {
    const studentId = this.normalizeRequiredString(input.studentId, "studentId");
    const classId = this.normalizeRequiredString(input.classId, "classId");
    const sessionId = this.normalizeRequiredString(input.sessionId, "sessionId");
    const termId = this.normalizeRequiredString(input.termId, "termId");
    const subclassId =
      input.subclassId === undefined
        ? undefined
        : (this.normalizeOptionalString(input.subclassId) ?? undefined);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        guardianEmail: true,
      },
    });
    if (!student) {
      throw new Error("Student not found");
    }

    const whereBase: Prisma.StudentBillingWhereInput = {
      studentId,
      classId,
      session: sessionId,
      term: termId,
      ...(subclassId !== undefined ? { subclassId } : {}),
    };

    const [billings, discounts, session, term, schoolClass, subClass] = await Promise.all([
      this.prisma.studentBilling.findMany({
        where: whereBase,
        select: {
          id: true,
          amount: true,
          billing: { select: { name: true, code: true } },
        },
      }),
      this.prisma.studentConcessionDiscount.findMany({
        where: {
          studentId,
          classId,
          session: sessionId,
          term: termId,
          ...(subclassId !== undefined ? { subclassId } : {}),
        },
        select: {
          id: true,
          amount: true,
          concessionDiscount: { select: { name: true, code: true } },
        },
      }),
      this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true },
      }),
      this.prisma.term.findUnique({ where: { id: termId }, select: { id: true, name: true } }),
      this.prisma.schoolClass.findUnique({
        where: { id: classId },
        select: { id: true, name: true },
      }),
      subclassId
        ? this.prisma.subClass.findUnique({
            where: { id: subclassId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    const totalBilling = billings.reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const totalDiscount = discounts.reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const netPayable = totalBilling - totalDiscount;

    const summary: ParentPeriodBillNotificationResult["summary"] = {
      sessionId,
      termId,
      classId,
      subclassId: subclassId ?? null,
      billingCount: billings.length,
      discountCount: discounts.length,
      totalBilling,
      totalDiscount,
      netPayable,
    };

    if (billings.length === 0 && discounts.length === 0) {
      return {
        studentId,
        guardianEmail: student.guardianEmail,
        sent: false,
        reason: "No student billing or discount records found for the selected period",
        summary,
      };
    }

    const guardianEmail = student.guardianEmail?.trim() || null;
    if (!guardianEmail) {
      return {
        studentId,
        guardianEmail: null,
        sent: false,
        reason: "Parent email is not set for this student",
        summary,
      };
    }

    if (!this.isValidEmail(guardianEmail)) {
      return {
        studentId,
        guardianEmail,
        sent: false,
        reason: "Parent email is invalid",
        summary,
      };
    }

    const studentName = [student.firstName, student.middleName, student.lastName]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join(" ");

    const billingRowsHtml =
      billings.length === 0
        ? "<li>No billing rows found.</li>"
        : billings
            .map((row) => {
              const label = row.billing?.name || row.billing?.code || `Billing #${row.id}`;
              return `<li>${label}: ${this.toNumber(row.amount).toFixed(2)}</li>`;
            })
            .join("");

    const discountRowsHtml =
      discounts.length === 0
        ? "<li>No discount rows found.</li>"
        : discounts
            .map((row) => {
              const label =
                row.concessionDiscount?.name ||
                row.concessionDiscount?.code ||
                `Discount #${row.id}`;
              return `<li>${label}: ${this.toNumber(row.amount).toFixed(2)}</li>`;
            })
            .join("");

    const subject = `Student Bill Notification - ${session?.name || sessionId} / ${term?.name || termId}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>Student Bill Notification</h2>
        <p>Dear Parent/Guardian,</p>
        <p>This is the bill summary for your child for the selected period.</p>
        <ul>
          <li><strong>Student:</strong> ${studentName} (${student.admissionNumber})</li>
          <li><strong>Class:</strong> ${schoolClass?.name || classId}</li>
          <li><strong>SubClass:</strong> ${subClass?.name || subclassId || "N/A"}</li>
          <li><strong>Session:</strong> ${session?.name || sessionId}</li>
          <li><strong>Term:</strong> ${term?.name || termId}</li>
        </ul>
        <h3>Billing Items</h3>
        <ul>${billingRowsHtml}</ul>
        <h3>Discount Items</h3>
        <ul>${discountRowsHtml}</ul>
        <hr />
        <p><strong>Total Billing:</strong> ${totalBilling.toFixed(2)}</p>
        <p><strong>Total Discount:</strong> ${totalDiscount.toFixed(2)}</p>
        <p><strong>Net Payable:</strong> ${netPayable.toFixed(2)}</p>
      </div>
    `;

    const sendResult = await emailService.sendEmail({
      to: guardianEmail,
      subject,
      html,
    });

    if (!sendResult.success) {
      throw new Error(sendResult.error || "Failed to send parent bill notification email");
    }

    return {
      studentId,
      guardianEmail,
      sent: true,
      messageId: sendResult.messageId,
      summary,
    };
  }

  async delete(id: number): Promise<StudentBillingRow> {
    const row = await this.prisma.studentBilling.findUnique({
      where: { id },
      select: { isPosted: true },
    });

    if (row?.isPosted) {
      throw new Error("Cannot delete student billing because it is already posted");
    }

    return this.prisma.studentBilling.delete({ where: { id } });
  }
}

export const studentBillingService = new StudentBillingService();
