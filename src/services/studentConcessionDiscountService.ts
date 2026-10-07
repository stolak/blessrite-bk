import { Prisma, StudentBillingStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { generateReferenceNo } from "../utils/referenceNo";
import { accountTransactionService } from "./accountTransactionService";
import { defaultAccountSettingsService } from "./defaultAccountSettingsService";

export type StudentConcessionDiscountRow = Prisma.StudentConcessionDiscountGetPayload<
  Record<string, never>
>;

export interface ListStudentConcessionDiscountsParams {
  studentId?: string;
  classId?: string;
  subclassId?: string;
  session?: string;
  term?: string;
  concessionDiscountId?: number;
  status?: StudentBillingStatus;
  referentId?: string;
  isPosted?: boolean;
  page?: number;
  limit?: number;
}

type CreateStudentConcessionDiscountInput = {
  studentId: string;
  classId: string;
  subclassId?: string | null;
  session: string;
  term: string;
  concessionDiscountId: number;
  amount: number;
  referentId?: string | null;
  createdBy: string;
};

type UpdateStudentConcessionDiscountInput = {
  studentId?: string;
  classId?: string;
  subclassId?: string | null;
  session?: string;
  term?: string;
  concessionDiscountId?: number;
  amount?: number;
  referentId?: string | null;
  status?: StudentBillingStatus;
  createdBy?: string | null;
  isPosted?: boolean;
};

type CreateManyStudentConcessionDiscountInput = {
  studentId: string;
  classId: string;
  subclassId?: string | null;
  session: string;
  term: string;
  referentId?: string | null;
  createdBy: string;
  entries: Array<{ concessionDiscountId: number; amount: number }>;
};

type BulkUpdateStudentConcessionDiscountStatusInput = {
  ids: number[];
  status: StudentBillingStatus;
  actedBy: string;
};

type BulkPostStudentConcessionDiscountInput = {
  ids: number[];
  actedBy: string;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class StudentConcessionDiscountService {
  private prisma = prisma;

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
      return generateReferenceNo("SCD");
    }
    return normalized;
  }

  private validateConcessionDiscountId(concessionDiscountId: number): void {
    if (!Number.isInteger(concessionDiscountId) || concessionDiscountId < 1) {
      throw new Error("concessionDiscountId must be a positive integer");
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("amount must be a valid number greater than or equal to 0");
    }
  }

  async create(input: CreateStudentConcessionDiscountInput): Promise<StudentConcessionDiscountRow> {
    this.validateConcessionDiscountId(input.concessionDiscountId);
    this.validateAmount(input.amount);

    return this.prisma.studentConcessionDiscount.create({
      data: {
        studentId: this.normalizeRequiredString(input.studentId, "studentId"),
        classId: this.normalizeRequiredString(input.classId, "classId"),
        subclassId: this.normalizeOptionalString(input.subclassId),
        session: this.normalizeRequiredString(input.session, "session"),
        term: this.normalizeRequiredString(input.term, "term"),
        concessionDiscountId: input.concessionDiscountId,
        amount: input.amount,
        referentId: this.normalizeReferentId(input.referentId),
        status: StudentBillingStatus.DRAFT,
        createdBy: this.normalizeRequiredString(input.createdBy, "createdBy"),
        approvedBy: null,
        approvedAt: null,
        isPosted: false,
        postedBy: null,
        postedAt: null,
      },
    });
  }

  async createMany(input: CreateManyStudentConcessionDiscountInput): Promise<{
    referentId: string;
    count: number;
    rows: StudentConcessionDiscountRow[];
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
        this.validateConcessionDiscountId(entry.concessionDiscountId);
        this.validateAmount(entry.amount);
        return this.prisma.studentConcessionDiscount.create({
          data: {
            studentId,
            classId,
            subclassId,
            session,
            term,
            concessionDiscountId: entry.concessionDiscountId,
            amount: entry.amount,
            referentId,
            status: StudentBillingStatus.DRAFT,
            createdBy,
            approvedBy: null,
            approvedAt: null,
            isPosted: false,
            postedBy: null,
            postedAt: null,
          },
        });
      })
    );

    return { referentId, count: rows.length, rows };
  }

  async list(params: ListStudentConcessionDiscountsParams = {}): Promise<{
    studentConcessionDiscounts: StudentConcessionDiscountRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StudentConcessionDiscountWhereInput = {};

    if (params.studentId !== undefined) where.studentId = params.studentId;
    if (params.classId !== undefined) where.classId = params.classId;
    if (params.subclassId !== undefined) where.subclassId = params.subclassId;
    if (params.session !== undefined) where.session = params.session;
    if (params.term !== undefined) where.term = params.term;
    if (params.concessionDiscountId !== undefined)
      where.concessionDiscountId = params.concessionDiscountId;
    if (params.status !== undefined) where.status = params.status;
    if (params.referentId !== undefined) where.referentId = params.referentId;
    if (params.isPosted !== undefined) where.isPosted = params.isPosted;

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.studentConcessionDiscount.count({ where: finalWhere }),
      this.prisma.studentConcessionDiscount.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          concessionDiscount: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        skip,
        take: limit,
      }),
    ]);

    return {
      studentConcessionDiscounts: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: number): Promise<StudentConcessionDiscountRow | null> {
    return this.prisma.studentConcessionDiscount.findUnique({ where: { id } });
  }

  async update(
    id: number,
    input: UpdateStudentConcessionDiscountInput
  ): Promise<StudentConcessionDiscountRow> {
    if (input.concessionDiscountId !== undefined)
      this.validateConcessionDiscountId(input.concessionDiscountId);
    if (input.amount !== undefined) this.validateAmount(input.amount);

    const data: Prisma.StudentConcessionDiscountUncheckedUpdateInput = {};
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
    if (input.concessionDiscountId !== undefined) {
      data.concessionDiscountId = input.concessionDiscountId;
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
    return this.prisma.studentConcessionDiscount.update({
      where: { id },
      data,
    });
  }

  async updateStatusMany(
    input: BulkUpdateStudentConcessionDiscountStatusInput
  ): Promise<{ count: number }> {
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
      const postedCount = await this.prisma.studentConcessionDiscount.count({
        where: {
          id: { in: ids },
          isPosted: true,
        },
      });
      if (postedCount > 0) {
        throw new Error("Posted records cannot be changed to DRAFT");
      }
    }

    const data: Prisma.StudentConcessionDiscountUncheckedUpdateManyInput =
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

    return this.prisma.studentConcessionDiscount.updateMany({
      where: { id: { in: ids } },
      data,
    });
  }

  async postMany(input: BulkPostStudentConcessionDiscountInput): Promise<{ count: number }> {
    if (!Array.isArray(input.ids) || input.ids.length === 0) {
      throw new Error("ids must be a non-empty array");
    }
    const ids = [...new Set(input.ids)];
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new Error("ids must contain only positive integers");
    }
    const actedBy = this.normalizeRequiredString(input.actedBy, "actedBy");

    const nonApprovedCount = await this.prisma.studentConcessionDiscount.count({
      where: {
        id: { in: ids },
        status: { not: StudentBillingStatus.APPROVED },
      },
    });
    if (nonApprovedCount > 0) {
      throw new Error("Only APPROVED records can be posted");
    }

    return this.prisma.$transaction(async (tx) => {
      const toPost = await tx.studentConcessionDiscount.findMany({
        where: {
          id: { in: ids },
          isPosted: false,
        },
        select: {
          id: true,
          studentId: true,
          concessionDiscountId: true,
          amount: true,
          referentId: true,
          concessionDiscount: {
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

      const discounts = await tx.concessionDiscount.findMany({
        where: {
          id: { in: [...new Set(toPost.map((row) => row.concessionDiscountId))] },
        },
        select: {
          id: true,
          accountId: true,
        },
      });
      const discountAccountById = new Map(discounts.map((d) => [d.id, d.accountId]));

      const postedAt = new Date();

      // ge
      const studentReceivableAccountId =
        await defaultAccountSettingsService.getAccountChartBySettingsId("STUDENT_ACCOUNT");
      if (!studentReceivableAccountId.accountId) {
        throw new Error(
          "Student receivable account chart is required before posting student billings contact the system administrator"
        );
      }
      let studentAccountId = studentReceivableAccountId.accountId;
      for (const row of toPost) {
        const discountAccountId = discountAccountById.get(row.concessionDiscountId);
        if (!discountAccountId) {
          throw new Error(
            `Concession discount account chart is required before posting discount ID ${row.id}`
          );
        }

        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(
            `Discount amount must be a positive number for discount ID ${row.id} - ${row.concessionDiscount?.name}`
          );
        }

        const reference = row.referentId?.trim() || `SCD-${row.id}`;
        const manualReference = `SCD-${row.id}`;
        const transactionDate = postedAt.toISOString();
        const remarks = `Student concession/discount for ${row.concessionDiscount?.name || row.concessionDiscountId}`;

        await accountTransactionService.debitAccount(
          {
            accountId: String(discountAccountId),
            amount,
            ref: reference,
            manualRef: manualReference,
            transactionDate,
            postedBy: actedBy,
            remarks,
          },
          tx
        );

        await accountTransactionService.creditAccount(
          {
            accountId: String(studentAccountId),
            amount,
            ref: reference,
            manualRef: manualReference,
            transactionDate,
            accountSub: row?.studentId,
            postedBy: actedBy,
            remarks,
          },
          tx
        );
      }

      return tx.studentConcessionDiscount.updateMany({
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

  async delete(id: number): Promise<StudentConcessionDiscountRow> {
    const row = await this.prisma.studentConcessionDiscount.findUnique({
      where: { id },
      select: { isPosted: true },
    });

    if (row?.isPosted) {
      throw new Error("Cannot delete student concession discount because it is already posted");
    }

    return this.prisma.studentConcessionDiscount.delete({ where: { id } });
  }
}

export const studentConcessionDiscountService = new StudentConcessionDiscountService();
