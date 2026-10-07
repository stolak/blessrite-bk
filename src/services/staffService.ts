import prisma from "../utils/prisma";
import bcrypt from "bcryptjs";
import { AppRole, EmploymentType, Prisma, StaffPosition, Status, UserType } from "@prisma/client";
import type { StaffBankDetailsInput } from "./staffBankDetailsService";

const staffInclude = {
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
  },
  createdBy: { select: { firstName: true, lastName: true } },
  gradeLevel: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  staffBankDetails: {
    include: {
      bank: { select: { id: true, bankCode: true, bankName: true } },
    },
  },
} satisfies Prisma.StaffInclude;

type StaffWithRelations = Prisma.StaffGetPayload<{ include: typeof staffInclude }>;

export interface StaffData {
  id: string;
  StaffNumber: string;
  email: string;
  name: string;
  position: StaffPosition;
  employmentType: EmploymentType;
  status: Status;
  profileImageUrl: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  gradeLevelId: string | null;
  step: number;
  salary: string;
  departmentId: string | null;
  userId: string | null;
  dateOfBirth: Date | null;
  dateOfAppointment: Date | null;
  dateOfResignation: Date | null;
  dateOfTermination: Date | null;
  user?: StaffWithRelations["user"];
  createdBy?: StaffWithRelations["createdBy"];
  gradeLevel?: StaffWithRelations["gradeLevel"];
  department?: StaffWithRelations["department"];
  banks?: StaffWithRelations["staffBankDetails"];
}

export interface ListStaffParams {
  q?: string;
  position?: StaffPosition;
  employmentType?: EmploymentType;
  departmentId?: string;
  gradeLevelId?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

export type StaffDateInput = Date | null | undefined;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function mapStaffRow(row: StaffWithRelations): StaffData {
  return {
    ...row,
    salary: row.salary.toString(),
  };
}

function parseSalary(value: string | number | undefined): Prisma.Decimal | undefined {
  if (value === undefined) return undefined;
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error("salary must be zero or greater");
  }
  return d;
}

function parseStep(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("step must be a non-negative integer");
  }
  return value;
}

export function parseStaffDateOnly(value: unknown): StaffDateInput | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const s = value.trim();
  if (!s) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const mo = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const parsed = new Date(Date.UTC(y, mo - 1, d));
    if (Number.isNaN(parsed.getTime())) return "invalid";
    return parsed;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

export class StaffService {
  private prisma = prisma;

  private async assertGradeLevelExists(gradeLevelId: string): Promise<void> {
    const row = await this.prisma.gradeLevel.findUnique({
      where: { id: gradeLevelId },
      select: { id: true },
    });
    if (!row) throw new Error("Invalid gradeLevelId");
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const row = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!row) throw new Error("Invalid departmentId");
  }

  private async assertBankExists(bankId: string): Promise<void> {
    const row = await this.prisma.bank.findUnique({ where: { id: bankId }, select: { id: true } });
    if (!row) throw new Error("Invalid bankId");
  }

  private normalizeBankRows(banks: StaffBankDetailsInput[]): {
    bankId: string;
    accountNumber: string;
    isPrimary: boolean;
    status?: Status;
  }[] {
    if (!banks.length) {
      throw new Error("banks must be a non-empty array when provided");
    }

    const primaryCount = banks.filter((b) => b.isPrimary === true).length;
    if (primaryCount > 1) {
      throw new Error("Only one bank entry in banks may have isPrimary true");
    }

    return banks.map((b, idx) => {
      const bankId = b.bankId?.trim();
      if (!bankId) throw new Error(`banks[${idx}].bankId is required`);
      const accountNumber = b.accountNumber?.trim();
      if (!accountNumber) throw new Error(`banks[${idx}].accountNumber is required`);
      return {
        bankId,
        accountNumber,
        isPrimary: b.isPrimary ?? false,
        ...(b.status !== undefined ? { status: b.status } : {}),
      };
    });
  }

  private async resolveOptionalFk(input: {
    gradeLevelId?: string | null;
    departmentId?: string | null;
  }): Promise<{ gradeLevelId?: string | null; departmentId?: string | null }> {
    if (input.gradeLevelId) {
      await this.assertGradeLevelExists(input.gradeLevelId);
    }
    if (input.departmentId) {
      await this.assertDepartmentExists(input.departmentId);
    }
    return {
      ...(input.gradeLevelId !== undefined ? { gradeLevelId: input.gradeLevelId } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    };
  }

  async createStaffWithUser(input: {
    StaffNumber: string;
    email: string;
    name: string;
    status?: Status;
    profileImageUrl?: string | null;
    createdById: string;
    password?: string;
    phoneNumber?: string | null;
    isActive?: boolean;
    isVerified?: boolean;
    isEmailVerified?: boolean;
    position?: StaffPosition;
    employmentType?: EmploymentType;
    appRoleId?: string | null;
    userType?: UserType;
    gradeLevelId?: string | null;
    departmentId?: string | null;
    step?: number;
    salary?: string | number;
    dateOfBirth?: StaffDateInput;
    dateOfAppointment?: StaffDateInput;
    dateOfResignation?: StaffDateInput;
    dateOfTermination?: StaffDateInput;
    banks?: StaffBankDetailsInput[];
  }): Promise<StaffData> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedStaffNumber = input.StaffNumber.trim();
    const normalizedName = input.name.trim();
    if (!normalizedStaffNumber) throw new Error("StaffNumber is required");
    if (!normalizedEmail) throw new Error("email is required");
    if (!normalizedName) throw new Error("name is required");

    const salary = parseSalary(input.salary);
    const step = parseStep(input.step);
    await this.resolveOptionalFk({
      gradeLevelId: input.gradeLevelId ?? undefined,
      departmentId: input.departmentId ?? undefined,
    });

    const normalizedBanks =
      input.banks !== undefined ? this.normalizeBankRows(input.banks) : undefined;
    if (normalizedBanks) {
      const bankIds = [...new Set(normalizedBanks.map((b) => b.bankId))];
      for (const bankId of bankIds) {
        await this.assertBankExists(bankId);
      }
    }

    const { firstName, lastName } = splitName(normalizedName);
    const rawPassword = input.password ?? "12345";
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        let appRole: AppRole | null = null;
        if (input.appRoleId) {
          appRole = await tx.appRole.findUnique({ where: { id: input.appRoleId } });
          if (!appRole) throw new Error("App role not found");
        }

        const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) throw new Error("Email already exists");

        const existingStaff = await tx.staff.findFirst({
          where: {
            OR: [{ StaffNumber: normalizedStaffNumber }, { email: normalizedEmail }],
          },
        });
        if (existingStaff) throw new Error("Staff number or email already exists");

        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            firstName,
            lastName,
            ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
            ...(input.profileImageUrl !== undefined
              ? { profileImageUrl: input.profileImageUrl }
              : {}),
            userType: input.userType ?? UserType.Staff,
            isActive: input.isActive ?? true,
            ...(input.isVerified !== undefined ? { isVerified: input.isVerified } : {}),
            ...(input.isEmailVerified !== undefined
              ? { isEmailVerified: input.isEmailVerified }
              : {}),
            createdById: input.createdById,
          },
          select: { id: true },
        });

        if (appRole) {
          await tx.userRole.create({
            data: {
              userId: createdUser.id,
              roleId: appRole.id,
            },
          });
        }

        const staff = await tx.staff.create({
          data: {
            StaffNumber: normalizedStaffNumber,
            email: normalizedEmail,
            name: normalizedName,
            ...(input.position !== undefined ? { position: input.position } : {}),
            ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
            status: input.status ?? Status.Active,
            profileImageUrl: input.profileImageUrl ?? null,
            createdById: input.createdById,
            userId: createdUser.id,
            ...(input.gradeLevelId !== undefined ? { gradeLevelId: input.gradeLevelId } : {}),
            ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
            ...(step !== undefined ? { step } : {}),
            ...(salary !== undefined ? { salary } : {}),
            ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
            ...(input.dateOfAppointment !== undefined
              ? { dateOfAppointment: input.dateOfAppointment }
              : {}),
            ...(input.dateOfResignation !== undefined
              ? { dateOfResignation: input.dateOfResignation }
              : {}),
            ...(input.dateOfTermination !== undefined
              ? { dateOfTermination: input.dateOfTermination }
              : {}),
          },
          include: staffInclude,
        });
        if (normalizedBanks?.length) {
          for (const bank of normalizedBanks) {
            await tx.staffBankDetails.create({
              data: {
                staffId: staff.id,
                bankId: bank.bankId,
                accountNumber: bank.accountNumber,
                isPrimary: bank.isPrimary,
                ...(bank.status !== undefined ? { status: bank.status } : {}),
              },
            });
          }
        }

        return tx.staff.findUniqueOrThrow({
          where: { id: staff.id },
          include: staffInclude,
        });
      });

      return mapStaffRow(staff);
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new Error("StaffNumber or email already exists");
      }
      throw e;
    }
  }

  async listStaff(params: ListStaffParams = {}): Promise<{
    staff: StaffData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StaffWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.position) where.position = params.position;
    if (params.employmentType) where.employmentType = params.employmentType;
    if (params.departmentId?.trim()) where.departmentId = params.departmentId.trim();
    if (params.gradeLevelId?.trim()) where.gradeLevelId = params.gradeLevelId.trim();

    if (params.q) {
      where.OR = [
        { StaffNumber: { contains: params.q } },
        { name: { contains: params.q } },
        { email: { contains: params.q } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.staff.count({ where }),
      this.prisma.staff.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: staffInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      staff: rows.map(mapStaffRow),
      pagination: { page, limit, total, totalPages },
    };
  }

  async getStaffById(id: string): Promise<StaffData | null> {
    const row = await this.prisma.staff.findUnique({
      where: { id },
      include: staffInclude,
    });
    return row ? mapStaffRow(row) : null;
  }

  async updateStaff(
    id: string,
    input: {
      StaffNumber?: string;
      email?: string;
      name?: string;
      position?: StaffPosition;
      employmentType?: EmploymentType;
      status?: Status;
      profileImageUrl?: string | null;
      gradeLevelId?: string | null;
      departmentId?: string | null;
      step?: number;
      salary?: string | number;
      dateOfBirth?: StaffDateInput;
      dateOfAppointment?: StaffDateInput;
      dateOfResignation?: StaffDateInput;
      dateOfTermination?: StaffDateInput;
    }
  ): Promise<StaffData> {
    const existing = await this.getStaffById(id);
    if (!existing) throw new Error("Staff not found");

    const email = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
    const staffNumber = input.StaffNumber !== undefined ? input.StaffNumber.trim() : undefined;
    const name = input.name !== undefined ? input.name.trim() : undefined;
    const salary = input.salary !== undefined ? parseSalary(input.salary) : undefined;
    const step = input.step !== undefined ? parseStep(input.step) : undefined;

    await this.resolveOptionalFk({
      gradeLevelId: input.gradeLevelId ?? undefined,
      departmentId: input.departmentId ?? undefined,
    });

    try {
      const row = await this.prisma.staff.update({
        where: { id },
        data: {
          ...(staffNumber !== undefined ? { StaffNumber: staffNumber } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.profileImageUrl !== undefined
            ? { profileImageUrl: input.profileImageUrl }
            : {}),
          ...(input.gradeLevelId !== undefined ? { gradeLevelId: input.gradeLevelId } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(step !== undefined ? { step } : {}),
          ...(salary !== undefined ? { salary } : {}),
          ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
          ...(input.dateOfAppointment !== undefined
            ? { dateOfAppointment: input.dateOfAppointment }
            : {}),
          ...(input.dateOfResignation !== undefined
            ? { dateOfResignation: input.dateOfResignation }
            : {}),
          ...(input.dateOfTermination !== undefined
            ? { dateOfTermination: input.dateOfTermination }
            : {}),
          updatedAt: new Date(),
        },
        include: staffInclude,
      });
      return mapStaffRow(row);
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new Error("StaffNumber or email already exists");
      }
      throw e;
    }
  }

  async deleteStaff(id: string): Promise<StaffData> {
    const existing = await this.getStaffById(id);
    if (!existing) throw new Error("Staff not found");
    const row = await this.prisma.staff.delete({
      where: { id },
      include: staffInclude,
    });
    return mapStaffRow(row);
  }
}

export const staffService = new StaffService();
