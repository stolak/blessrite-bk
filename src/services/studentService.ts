import prisma from "../utils/prisma";
import bcrypt from "bcryptjs";
import { Gender, Prisma, StudentStatus, UserType } from "@prisma/client";

export interface StudentData {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  studentEmail: string | null;
  gender: Gender;
  dateOfBirth: Date;
  classId: string | null;
  subClassId?: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianContact: string | null;
  address: string | null;
  imageUrl: string | null;
  status: StudentStatus;
  userId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  class?: { id: string; name: string } | null;
  subClass?: { id: string; name: string; classId: string | null } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface ListStudentsParams {
  q?: string;
  classId?: string;
  subClassId?: string;
  status?: StudentStatus | "All";
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class StudentService {
  private prisma = prisma;
  private static readonly STUDENT_SUBHEAD_SETTINGS_ID = "STUDENT_SUBHEAD";
  private static readonly DEFAULT_USER_PASSWORD = "12345";

  private splitName(fullName: string): { firstName: string | null; lastName: string | null } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: null, lastName: null };
    if (parts.length === 1) return { firstName: parts[0], lastName: null };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  private normalizeEmail(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }

  private getEnvRoleId(key: "STUDENT_ROLE_ID" | "PARENT_ROLE_ID"): string | null {
    const value = process.env[key]?.trim();
    return value || null;
  }

  private async assignUserAppRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string | null
  ): Promise<void> {
    if (!roleId) return;
    await tx.userRole.upsert({
      where: { userId },
      create: { userId, roleId },
      update: { roleId },
    });
  }

  private async assertStudentEmailAvailable(
    email: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const [existingUser, existingStudent] = await Promise.all([
      tx.user.findUnique({ where: { email }, select: { id: true } }),
      tx.student.findFirst({ where: { studentEmail: email }, select: { id: true } }),
    ]);
    if (existingUser || existingStudent) {
      throw new Error("Student email already exists");
    }
  }

  private async ensureGuardianUser(
    input: {
      guardianEmail: string;
      guardianName?: string | null;
      guardianContact?: string | null;
      createdById: string;
    },
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const existing = await tx.user.findUnique({
      where: { email: input.guardianEmail },
      select: { id: true },
    });
    if (existing) return;

    const { firstName, lastName } = input.guardianName
      ? this.splitName(input.guardianName)
      : { firstName: null, lastName: null };
    const hashedPassword = await bcrypt.hash(StudentService.DEFAULT_USER_PASSWORD, 10);

    const user = await tx.user.create({
      data: {
        email: input.guardianEmail,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber: input.guardianContact?.trim() || null,
        userType: UserType.Parent,
        isActive: true,
        createdById: input.createdById,
      },
      select: { id: true },
    });

    await this.assignUserAppRole(tx, user.id, this.getEnvRoleId("PARENT_ROLE_ID"));
  }

  private async assertClassExists(classId: string) {
    const cls = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!cls) throw new Error("Invalid classId");
  }

  private async assertSubClassExists(subClassId: string) {
    const sub = await this.prisma.subClass.findUnique({
      where: { id: subClassId },
      select: { id: true },
    });
    if (!sub) throw new Error("Invalid subClassId");
  }

  private async resolveClassAndSubClassForBulkUpdate(input: {
    classId?: string | null;
    subClassId?: string | null;
    status?: StudentStatus;
  }): Promise<{ classId?: string | null; subClassId?: string | null }> {
    let classId = input.classId;
    const subClassId = input.subClassId;

    if (classId) await this.assertClassExists(classId);

    if (subClassId) {
      const sub = await this.prisma.subClass.findUnique({
        where: { id: subClassId },
        select: { id: true, classId: true },
      });
      if (!sub) throw new Error("Invalid subClassId");
      if (sub.classId) {
        if (classId !== undefined && classId !== null && classId !== sub.classId) {
          throw new Error("subClassId does not belong to the specified classId");
        }
        if (classId === undefined) {
          classId = sub.classId;
        }
      }
    }

    return {
      ...(classId !== undefined ? { classId } : {}),
      ...(subClassId !== undefined ? { subClassId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
  }

  private readonly studentInclude = {
    class: { select: { id: true, name: true } },
    subClass: { select: { id: true, name: true, classId: true } },
    createdBy: { select: { firstName: true, lastName: true } },
  } as const;

  async createStudent(input: {
    admissionNumber: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    studentEmail?: string | null;
    gender: Gender;
    dateOfBirth: Date;
    classId?: string | null;
    subClassId?: string | null;
    guardianName?: string | null;
    guardianEmail?: string | null;
    guardianContact?: string | null;
    address?: string | null;
    imageUrl?: string | null;
    status?: StudentStatus;
    createdById: string;
  }): Promise<StudentData> {
    if (input.classId) await this.assertClassExists(input.classId);
    if (input.subClassId) await this.assertSubClassExists(input.subClassId);

    const studentEmail = this.normalizeEmail(input.studentEmail);
    const guardianEmail = this.normalizeEmail(input.guardianEmail);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (studentEmail) {
          await this.assertStudentEmailAvailable(studentEmail, tx);
        }

        if (guardianEmail && guardianEmail !== studentEmail) {
          await this.ensureGuardianUser(
            {
              guardianEmail,
              guardianName: input.guardianName,
              guardianContact: input.guardianContact,
              createdById: input.createdById,
            },
            tx
          );
        }

        let userId: string | null = null;
        if (studentEmail) {
          const hashedPassword = await bcrypt.hash(StudentService.DEFAULT_USER_PASSWORD, 10);
          const user = await tx.user.create({
            data: {
              email: studentEmail,
              password: hashedPassword,
              firstName: input.firstName,
              lastName: input.lastName,
              userType: UserType.Student,
              isActive: true,
              createdById: input.createdById,
            },
            select: { id: true },
          });
          userId = user.id;
          await this.assignUserAppRole(tx, userId, this.getEnvRoleId("STUDENT_ROLE_ID"));
        }

        return tx.student.create({
          data: {
            admissionNumber: input.admissionNumber,
            firstName: input.firstName,
            middleName: input.middleName ?? null,
            lastName: input.lastName,
            studentEmail,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth,
            classId: input.classId ?? null,
            subClassId: input.subClassId ?? null,
            guardianName: input.guardianName ?? null,
            guardianEmail,
            guardianContact: input.guardianContact ?? null,
            address: input.address ?? null,
            imageUrl: input.imageUrl ?? null,
            createdById: input.createdById,
            userId,
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
          include: {
            class: { select: { id: true, name: true } },
            subClass: { select: { id: true, name: true, classId: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
        });
      });

      return created;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        const target = (e as { meta?: { target?: string[] } }).meta?.target;
        if (target?.includes("student_email") || target?.includes("email")) {
          throw new Error("Student email already exists");
        }
        throw new Error("Admission number already exists");
      }
      throw e;
    }
  }

  async listStudents(params: ListStudentsParams = {}): Promise<{
    students: StudentData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StudentWhereInput = {};

    if (params.status === undefined) {
      where.status = StudentStatus.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.classId) {
      where.classId = params.classId;
    }

    if (params.subClassId) {
      where.subClassId = params.subClassId;
    }

    if (params.q) {
      where.OR = [
        { admissionNumber: { contains: params.q } },
        { firstName: { contains: params.q } },
        { middleName: { contains: params.q } },
        { lastName: { contains: params.q } },
        { studentEmail: { contains: params.q } },
        { guardianName: { contains: params.q } },
        { guardianEmail: { contains: params.q } },
        { guardianContact: { contains: params.q } },
      ];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.student.count({ where: finalWhere }),
      this.prisma.student.findMany({
        where: finalWhere,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: limit,
        include: {
          class: { select: { id: true, name: true } },
          subClass: { select: { id: true, name: true, classId: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const qLower = params.q?.toLowerCase();
    const students = qLower
      ? rows.filter((s) => {
          const hay = [
            s.admissionNumber,
            s.firstName,
            s.middleName ?? "",
            s.lastName,
            s.studentEmail ?? "",
            s.guardianName ?? "",
            s.guardianEmail ?? "",
            s.guardianContact ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(qLower);
        })
      : rows;

    return { students, pagination: { page, limit, total, totalPages } };
  }

  async listByGuardianEmail(
    guardianEmail: string,
    params: { status?: StudentStatus | "All" } = {}
  ): Promise<{ students: StudentData[]; count: number }> {
    const email = guardianEmail.trim().toLowerCase();
    if (!email) throw new Error("guardianEmail is required");

    const where: Prisma.StudentWhereInput = { guardianEmail: email };

    if (params.status === undefined) {
      where.status = StudentStatus.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    const rows = await this.prisma.student.findMany({
      where,
      include: this.studentInclude,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return { students: rows, count: rows.length };
  }

  async getStudentById(id: string): Promise<StudentData | null> {
    return await this.prisma.student.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true } },
        subClass: { select: { id: true, name: true, classId: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async updateStudent(
    id: string,
    input: {
      admissionNumber?: string;
      firstName?: string;
      middleName?: string | null;
      lastName?: string;
      studentEmail?: string | null;
      gender?: Gender;
      dateOfBirth?: Date;
      classId?: string | null;
      subClassId?: string | null;
      guardianName?: string | null;
      guardianEmail?: string | null;
      guardianContact?: string | null;
      address?: string | null;
      imageUrl?: string | null;
      status?: StudentStatus;
    }
  ): Promise<StudentData> {
    if (input.classId) await this.assertClassExists(input.classId);
    if (input.subClassId) await this.assertSubClassExists(input.subClassId);

    try {
      return await this.prisma.student.update({
        where: { id },
        data: {
          ...(input.admissionNumber !== undefined
            ? { admissionNumber: input.admissionNumber }
            : {}),
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.studentEmail !== undefined ? { studentEmail: input.studentEmail } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
          ...(input.classId !== undefined ? { classId: input.classId } : {}),
          ...(input.subClassId !== undefined ? { subClassId: input.subClassId } : {}),
          ...(input.guardianName !== undefined ? { guardianName: input.guardianName } : {}),
          ...(input.guardianEmail !== undefined ? { guardianEmail: input.guardianEmail } : {}),
          ...(input.guardianContact !== undefined
            ? { guardianContact: input.guardianContact }
            : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
        include: {
          class: { select: { id: true, name: true } },
          subClass: { select: { id: true, name: true, classId: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Admission number already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to update not found");
      }
      throw e;
    }
  }

  async bulkUpdateStudentClassAndSubClassAndStatus(input: {
    studentIds: string[];
    classId?: string | null;
    subClassId?: string | null;
    status?: StudentStatus;
  }): Promise<StudentData[]> {
    if (
      input.classId === undefined &&
      input.subClassId === undefined &&
      input.status === undefined
    ) {
      throw new Error("At least one of classId or subClassId or status must be provided");
    }
    if (!input.studentIds.length) {
      throw new Error("studentIds must not be empty");
    }

    const studentIds = [
      ...new Set(input.studentIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];
    if (!studentIds.length) {
      throw new Error("studentIds must not be empty");
    }

    const resolved = await this.resolveClassAndSubClassForBulkUpdate({
      classId: input.classId,
      subClassId: input.subClassId,
      status: input.status,
    });

    const existing = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((s) => s.id));
    const missing = studentIds.filter((id) => !existingSet.has(id));
    if (missing.length) {
      throw new Error(`Student not found: ${missing.join(", ")}`);
    }

    await this.prisma.student.updateMany({
      where: { id: { in: studentIds } },
      data: {
        ...(resolved.classId !== undefined ? { classId: resolved.classId } : {}),
        ...(resolved.subClassId !== undefined ? { subClassId: resolved.subClassId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      },
    });

    return await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: this.studentInclude,
    });
  }

  async deleteStudent(id: string): Promise<StudentData> {
    const [studentBillingCount, studentDiscountCount, inventoryTransactionCount] =
      await Promise.all([
        this.prisma.studentBilling.count({ where: { studentId: id } }),
        this.prisma.studentConcessionDiscount.count({ where: { studentId: id } }),
        this.prisma.inventoryTransaction.count({ where: { studentId: id } }),
      ]);

    if (studentBillingCount > 0 || studentDiscountCount > 0 || inventoryTransactionCount > 0) {
      const blockers: string[] = [];
      if (studentBillingCount > 0) blockers.push(`student billings (${studentBillingCount})`);
      if (studentDiscountCount > 0) blockers.push(`student discounts (${studentDiscountCount})`);
      if (inventoryTransactionCount > 0)
        blockers.push(`inventory transactions (${inventoryTransactionCount})`);

      throw new Error(`Cannot delete student because it is referenced by: ${blockers.join(", ")}`);
    }

    try {
      return await this.prisma.student.delete({
        where: { id },
        include: {
          class: { select: { id: true, name: true } },
          subClass: { select: { id: true, name: true, classId: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Record to delete does not exist");
      }
      throw e;
    }
  }
}

export const studentService = new StudentService();
