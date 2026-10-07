import prisma from "../utils/prisma";
import { Prisma, StudentBillingStatus } from "@prisma/client";
import { generateReferenceNo } from "../utils/referenceNo";

export type ClassDefaultBillingRow = Prisma.ClassDefaultBillingGetPayload<Record<string, never>>;

export interface ListClassDefaultBillingsParams {
  classId?: string;
  subclassId?: string;
  session?: string;
  term?: string;
  billingId?: number;
}

type CreateClassDefaultBillingInput = {
  classId: string;
  subclassId?: string | null;
  session: string;
  term: string;
  billingId: number;
  amount: number;
};

type UpdateClassDefaultBillingInput = Partial<CreateClassDefaultBillingInput>;

export type ApplyClassDefaultBillingsToStudentsInput = {
  sessionId: string;
  termId: string;
  classId: string;
  subclassId?: string;
  createdBy: string;
};

export type ApplyClassDefaultBillingsToStudentsResult = {
  sessionId: string;
  termId: string;
  classId: string;
  subclassId: string | null;
  defaultBillingCount: number;
  studentCount: number;
  created: number;
  updated: number;
  skippedApproved: number;
};

export class ClassDefaultBillingService {
  private prisma = prisma;

  private normalizeStringRequired(value: string, fieldName: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error(`${fieldName} is required`);
    }
    return normalized;
  }

  private normalizeStringOptional(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
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

  private async validateBillingItemExists(billingId: number): Promise<void> {
    const row = await this.prisma.billingItem.findUnique({
      where: { id: billingId },
      select: { id: true },
    });
    if (!row) {
      throw new Error(`Billing item not found for billingId ${billingId}`);
    }
  }

  private async validateBillingItemsExist(billingIds: number[]): Promise<void> {
    const uniqueIds = [...new Set(billingIds)];
    if (uniqueIds.length === 0) {
      return;
    }
    const count = await this.prisma.billingItem.count({
      where: { id: { in: uniqueIds } },
    });
    if (count !== uniqueIds.length) {
      throw new Error("One or more billingId values are invalid");
    }
  }

  async create(input: CreateClassDefaultBillingInput): Promise<ClassDefaultBillingRow> {
    this.validateBillingId(input.billingId);
    this.validateAmount(input.amount);
    await this.validateBillingItemExists(input.billingId);

    return this.prisma.classDefaultBilling.create({
      data: {
        classId: this.normalizeStringRequired(input.classId, "classId"),
        subclassId: this.normalizeStringOptional(input.subclassId),
        session: this.normalizeStringRequired(input.session, "session"),
        term: this.normalizeStringRequired(input.term, "term"),
        billingId: input.billingId,
        amount: input.amount,
      },
    });
  }

  async createMany(input: {
    classId: string;
    subclassId?: string | null;
    session: string;
    term: string;
    items: Array<{ billingId: number; amount: number }>;
  }): Promise<{ count: number; rows: ClassDefaultBillingRow[] }> {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error("items must be a non-empty array");
    }

    for (const item of input.items) {
      this.validateBillingId(item.billingId);
      this.validateAmount(item.amount);
    }

    await this.validateBillingItemsExist(input.items.map((x) => x.billingId));

    const classId = this.normalizeStringRequired(input.classId, "classId");
    const subclassId = this.normalizeStringOptional(input.subclassId);
    const session = this.normalizeStringRequired(input.session, "session");
    const term = this.normalizeStringRequired(input.term, "term");

    const rows = await this.prisma.$transaction(
      input.items.map((item) =>
        this.prisma.classDefaultBilling.create({
          data: {
            classId,
            subclassId,
            session,
            term,
            billingId: item.billingId,
            amount: item.amount,
          },
        })
      )
    );

    return { count: rows.length, rows };
  }

  async list(filters: ListClassDefaultBillingsParams = {}): Promise<ClassDefaultBillingRow[]> {
    const where: Prisma.ClassDefaultBillingWhereInput = {};

    if (filters.classId !== undefined) {
      where.classId = filters.classId.trim();
    }
    if (filters.subclassId !== undefined) {
      where.subclassId = filters.subclassId.trim();
    }
    if (filters.session !== undefined) {
      where.session = filters.session.trim();
    }
    if (filters.term !== undefined) {
      where.term = filters.term.trim();
    }
    if (filters.billingId !== undefined) {
      where.billingId = filters.billingId;
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    return this.prisma.classDefaultBilling.findMany({
      where: finalWhere,
      orderBy: [
        { classId: "asc" },
        { session: "asc" },
        { term: "asc" },
        { billingId: "asc" },
        { id: "asc" },
      ],
      include: {
        billing: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async getById(id: number): Promise<ClassDefaultBillingRow | null> {
    return this.prisma.classDefaultBilling.findUnique({ where: { id } });
  }

  async update(id: number, input: UpdateClassDefaultBillingInput): Promise<ClassDefaultBillingRow> {
    if (input.billingId !== undefined) {
      this.validateBillingId(input.billingId);
      await this.validateBillingItemExists(input.billingId);
    }
    if (input.amount !== undefined) {
      this.validateAmount(input.amount);
    }

    const data: Prisma.ClassDefaultBillingUpdateInput = {};

    if (input.classId !== undefined) {
      data.classId = this.normalizeStringRequired(input.classId, "classId");
    }
    if (input.subclassId !== undefined) {
      data.subclassId = this.normalizeStringOptional(input.subclassId);
    }
    if (input.session !== undefined) {
      data.session = this.normalizeStringRequired(input.session, "session");
    }
    if (input.term !== undefined) {
      data.term = this.normalizeStringRequired(input.term, "term");
    }
    if (input.amount !== undefined) {
      data.amount = input.amount;
    }

    return this.prisma.classDefaultBilling.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<ClassDefaultBillingRow> {
    return this.prisma.classDefaultBilling.delete({ where: { id } });
  }

  /**
   * Load class default billings for a period/class (and optional subclass),
   * then create/update DRAFT student billings for matching students.
   * Already APPROVED student billing items for the same student/billing/session/term are skipped.
   */
  async applyToStudents(
    input: ApplyClassDefaultBillingsToStudentsInput
  ): Promise<ApplyClassDefaultBillingsToStudentsResult> {
    const sessionId = this.normalizeStringRequired(input.sessionId, "sessionId");
    const termId = this.normalizeStringRequired(input.termId, "termId");
    const classId = this.normalizeStringRequired(input.classId, "classId");
    const subclassId = this.normalizeStringOptional(input.subclassId) ?? null;
    const createdBy = this.normalizeStringRequired(input.createdBy, "createdBy");

    const [session, term, schoolClass] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
      this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true } }),
    ]);
    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (!schoolClass) throw new Error("Invalid classId");

    if (subclassId) {
      const subclass = await this.prisma.subClass.findUnique({
        where: { id: subclassId },
        select: { id: true, classId: true },
      });
      if (!subclass) throw new Error("Invalid subclassId");
      if (subclass.classId !== classId) {
        throw new Error("subclassId does not belong to the specified classId");
      }
    }

    const defaultWhere: Prisma.ClassDefaultBillingWhereInput = {
      classId,
      session: sessionId,
      term: termId,
      ...(subclassId
        ? { OR: [{ subclassId: null }, { subclassId }] }
        : {}),
    };

    const defaults = await this.prisma.classDefaultBilling.findMany({
      where: defaultWhere,
      orderBy: [{ billingId: "asc" }, { id: "asc" }],
    });

    if (defaults.length === 0) {
      throw new Error(
        "No class default billings found for the specified session, term, and class"
      );
    }

    const students = await this.prisma.student.findMany({
      where: {
        classId,
        ...(subclassId ? { subClassId: subclassId } : {}),
      },
      select: {
        id: true,
        classId: true,
        subClassId: true,
        admissionNumber: true,
      },
      orderBy: { admissionNumber: "asc" },
    });

    let created = 0;
    let updated = 0;
    let skippedApproved = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const student of students) {
        const applicableDefaults = defaults.filter(
          (row) => row.subclassId === null || row.subclassId === student.subClassId
        );

        for (const def of applicableDefaults) {
          const existing = await tx.studentBilling.findFirst({
            where: {
              studentId: student.id,
              billingId: def.billingId,
              session: sessionId,
              term: termId,
            },
            select: {
              id: true,
              status: true,
              isPosted: true,
            },
          });

          if (existing?.status === StudentBillingStatus.APPROVED) {
            skippedApproved += 1;
            continue;
          }

          const amount = Number(def.amount);
          if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(
              `Invalid amount on class default billing id ${def.id} for billingId ${def.billingId}`
            );
          }

          if (existing) {
            await tx.studentBilling.update({
              where: { id: existing.id },
              data: {
                classId: student.classId ?? classId,
                subclassId: student.subClassId,
                amount,
                status: StudentBillingStatus.DRAFT,
                approvedBy: null,
                approvedAt: null,
                createdBy,
              },
            });
            updated += 1;
          } else {
            await tx.studentBilling.create({
              data: {
                studentId: student.id,
                classId: student.classId ?? classId,
                subclassId: student.subClassId,
                session: sessionId,
                term: termId,
                billingId: def.billingId,
                amount,
                referentId: generateReferenceNo("STB"),
                status: StudentBillingStatus.DRAFT,
                createdBy,
                approvedBy: null,
                approvedAt: null,
                postedBy: null,
                postedAt: null,
                isPosted: false,
              },
            });
            created += 1;
          }
        }
      }
    });

    return {
      sessionId,
      termId,
      classId,
      subclassId,
      defaultBillingCount: defaults.length,
      studentCount: students.length,
      created,
      updated,
      skippedApproved,
    };
  }
}

export const classDefaultBillingService = new ClassDefaultBillingService();
