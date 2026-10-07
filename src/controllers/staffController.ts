import { Request, Response } from "express";
import { staffService, parseStaffDateOnly } from "../services/staffService";
import { EmploymentType, StaffPosition, Status, UserType } from "@prisma/client";
import { isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";

const STAFF_POSITIONS = Object.values(StaffPosition) as string[];
const EMPLOYMENT_TYPES = Object.values(EmploymentType) as string[];

const STAFF_DATE_FIELDS = [
  "dateOfBirth",
  "dateOfAppointment",
  "dateOfResignation",
  "dateOfTermination",
] as const;

type StaffDateField = (typeof STAFF_DATE_FIELDS)[number];

function parseOptionalUuid(raw: unknown): string | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || !raw.trim()) return "invalid";
  return raw.trim();
}

function parseStaffDates(body: Record<string, unknown>): {
  dates?: Partial<Record<StaffDateField, Date | null>>;
  error?: string;
} {
  const dates: Partial<Record<StaffDateField, Date | null>> = {};
  for (const field of STAFF_DATE_FIELDS) {
    if (!(field in body)) continue;
    const parsed = parseStaffDateOnly(body[field]);
    if (parsed === "invalid") {
      return { error: `${field} must be YYYY-MM-DD, ISO date-time, or null` };
    }
    if (parsed !== undefined) {
      dates[field] = parsed;
    }
  }
  return { dates };
}

function parseSalaryInput(raw: unknown): string | number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
}

function parseStepInput(raw: unknown): number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

function parseBodyStatus(raw: unknown): Status | undefined {
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

function parseStaffBanksInput(raw: unknown):
  | { banks: { bankId: string; accountNumber: string; isPrimary?: boolean; status?: Status }[] }
  | { error: string } {
  if (raw === undefined) return { banks: [] };
  if (!Array.isArray(raw)) {
    return { error: "banks must be an array" };
  }
  if (raw.length === 0) {
    return { error: "banks must be a non-empty array when provided" };
  }

  const banks: { bankId: string; accountNumber: string; isPrimary?: boolean; status?: Status }[] =
    [];

  for (const [idx, row] of raw.entries()) {
    if (!row || typeof row !== "object") {
      return { error: `banks[${idx}] must be an object` };
    }
    const { bankId, accountNumber, isPrimary, status } = row as Record<string, unknown>;
    if (!bankId || typeof bankId !== "string" || !bankId.trim()) {
      return { error: `banks[${idx}].bankId is required` };
    }
    if (!accountNumber || typeof accountNumber !== "string" || !accountNumber.trim()) {
      return { error: `banks[${idx}].accountNumber is required` };
    }
    if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
      return { error: `banks[${idx}].isPrimary must be a boolean` };
    }
    const parsedStatus = parseBodyStatus(status);
    if (status !== undefined && parsedStatus === undefined) {
      return {
        error: `banks[${idx}].status must be Active, Inactive, or Archived`,
      };
    }
    banks.push({
      bankId: bankId.trim(),
      accountNumber: accountNumber.trim(),
      ...(typeof isPrimary === "boolean" ? { isPrimary } : {}),
      ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
    });
  }

  return { banks };
}

function httpStatusForStaffError(message: string): number {
  if (
    message === "Staff not found" ||
    message === "App role not found" ||
    message === "Invalid bankId"
  ) {
    return 404;
  }
  if (message.includes("already exists")) return 409;
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("Invalid ") ||
    message.includes("invalid") ||
    message.includes("Only one bank")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/staff:
 *   post:
 *     summary: Register a staff member and create a linked user
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates a User and a Staff row linked via Staff.userId.
 *       Email is checked on users and staff; StaffNumber must be unique on staff.
 *       Optional `appRoleId` is an AppRole id (UUID) — when provided, a UserRole row is created for the new user.
 *       Optional `banks` creates StaffBankDetails rows in the same transaction (at most one entry with `isPrimary` true).
 *       Password defaults to `12345` if omitted. Staff `position` defaults to teacher and `employmentType` defaults to Permanent when omitted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [StaffNumber, email, name]
 *             properties:
 *               StaffNumber:
 *                 type: string
 *                 description: Unique staff number
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *                 description: Full name (split into user firstName/lastName)
 *               position:
 *                 type: string
 *                 enum: [class_teacher, assistant_teacher, subject_teacher, principal, vice_principal, teacher, admin, other]
 *                 description: Staff job position (defaults to teacher)
 *               employmentType:
 *                 type: string
 *                 enum: [Permanent, Contractual, Casual, Internship, Volunteer, PartTime, Temporary, Seasonal, ProjectBased, Other]
 *                 description: Employment type (defaults to Permanent)
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Staff record status (defaults to Active)
 *               profileImageUrl:
 *                 type: string
 *                 nullable: true
 *               gradeLevelId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               step:
 *                 type: integer
 *                 minimum: 0
 *                 description: Salary step (defaults to 0)
 *               salary:
 *                 oneOf: [{ type: string }, { type: number }]
 *                 description: Monthly salary (defaults to 0)
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               dateOfAppointment:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               dateOfResignation:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               dateOfTermination:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               password:
 *                 type: string
 *                 description: User login password (defaults to 12345)
 *               phoneNumber:
 *                 type: string
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *                 description: User.isActive (defaults to true)
 *               isVerified:
 *                 type: boolean
 *               isEmailVerified:
 *                 type: boolean
 *               appRoleId:
 *                 type: string
 *                 format: uuid
 *                 description: AppRole id to assign via UserRole (optional)
 *               userType:
 *                 type: string
 *                 enum: [SuperAdmin, Staff, Student, Parent]
 *                 description: User.userType (defaults to Staff)
 *               banks:
 *                 type: array
 *                 minItems: 1
 *                 description: Optional bank accounts to create for the new staff member
 *                 items:
 *                   type: object
 *                   required: [bankId, accountNumber]
 *                   properties:
 *                     bankId:
 *                       type: string
 *                       format: uuid
 *                     accountNumber:
 *                       type: string
 *                     isPrimary:
 *                       type: boolean
 *                       description: Defaults to false; at most one entry may be true
 *                     status:
 *                       type: string
 *                       enum: [Active, Inactive, Archived]
 *                       description: Defaults to Active
 *     responses:
 *       201:
 *         description: Staff and user created (includes `banks` when bank accounts were provided)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: App role, grade level, department, or bank not found
 *       409:
 *         description: Duplicate StaffNumber or email
 *       500:
 *         description: Server error
 *   get:
 *     summary: List staff
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Optional search in StaffNumber, name, email
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *           enum: [class_teacher, assistant_teacher, subject_teacher, principal, vice_principal, teacher, admin, other]
 *         description: Filter by Staff.position
 *       - in: query
 *         name: employmentType
 *         schema:
 *           type: string
 *           enum: [Permanent, Contractual, Casual, Internship, Volunteer, PartTime, Temporary, Seasonal, ProjectBased, Other]
 *         description: Filter by employment type
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by department
 *       - in: query
 *         name: gradeLevelId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by grade level
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Staff list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const staffController = {
  createStaff: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const {
        StaffNumber,
        email,
        name,
        position,
        employmentType,
        appRoleId,
        status,
        profileImageUrl,
        password,
        phoneNumber,
        isActive,
        isVerified,
        isEmailVerified,
        userType,
        gradeLevelId,
        departmentId,
        step,
        salary,
        banks,
      } = body;

      if (!StaffNumber || typeof StaffNumber !== "string" || !StaffNumber.trim()) {
        return res.status(400).json({ success: false, message: "StaffNumber is required" });
      }
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ success: false, message: "email is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (position !== undefined && position !== null && !STAFF_POSITIONS.includes(position as string)) {
        return res.status(400).json({ success: false, message: "Invalid position" });
      }
      if (
        employmentType !== undefined &&
        employmentType !== null &&
        !EMPLOYMENT_TYPES.includes(employmentType as string)
      ) {
        return res.status(400).json({ success: false, message: "Invalid employmentType" });
      }
      if (
        appRoleId !== undefined &&
        appRoleId !== null &&
        (typeof appRoleId !== "string" || !appRoleId.trim())
      ) {
        return res
          .status(400)
          .json({ success: false, message: "appRoleId must be a non-empty AppRole id" });
      }
      if (
        status !== undefined &&
        status !== null &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      if (!isStringOrNullOrUndefined(profileImageUrl)) {
        return res
          .status(400)
          .json({ success: false, message: "profileImageUrl must be a string or null" });
      }
      if (phoneNumber !== undefined && !isStringOrNullOrUndefined(phoneNumber)) {
        return res
          .status(400)
          .json({ success: false, message: "phoneNumber must be a string or null" });
      }
      if (password !== undefined && typeof password !== "string") {
        return res.status(400).json({ success: false, message: "password must be a string" });
      }
      if (userType !== undefined && !Object.values(UserType).includes(userType as UserType)) {
        return res.status(400).json({
          success: false,
          message: "userType must be SuperAdmin, Staff, Student, or Parent",
        });
      }

      const parsedGradeLevelId = parseOptionalUuid(gradeLevelId);
      if (parsedGradeLevelId === "invalid") {
        return res.status(400).json({ success: false, message: "gradeLevelId must be a uuid or null" });
      }
      const parsedDepartmentId = parseOptionalUuid(departmentId);
      if (parsedDepartmentId === "invalid") {
        return res.status(400).json({ success: false, message: "departmentId must be a uuid or null" });
      }

      const parsedStep = parseStepInput(step);
      if (parsedStep === "invalid") {
        return res.status(400).json({ success: false, message: "step must be a non-negative integer" });
      }
      const parsedSalary = parseSalaryInput(salary);
      if (parsedSalary === "invalid") {
        return res.status(400).json({ success: false, message: "salary must be a number or numeric string" });
      }

      const { dates, error: dateError } = parseStaffDates(body);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }

      const banksParsed = parseStaffBanksInput(banks);
      if ("error" in banksParsed) {
        return res.status(400).json({ success: false, message: banksParsed.error });
      }

      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await staffService.createStaffWithUser({
        StaffNumber: StaffNumber.trim(),
        email: email.trim(),
        name: name.trim(),
        ...(position !== undefined && position !== null ? { position: position as StaffPosition } : {}),
        ...(employmentType !== undefined && employmentType !== null
          ? { employmentType: employmentType as EmploymentType }
          : {}),
        ...(status !== undefined && status !== null ? { status: status as Status } : {}),
        profileImageUrl:
          profileImageUrl === undefined
            ? undefined
            : profileImageUrl === ""
              ? null
              : (profileImageUrl as string | null),
        createdById,
        ...(typeof password === "string" ? { password } : {}),
        ...(phoneNumber !== undefined
          ? { phoneNumber: phoneNumber === "" ? null : (phoneNumber as string | null) }
          : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(typeof isVerified === "boolean" ? { isVerified } : {}),
        ...(typeof isEmailVerified === "boolean" ? { isEmailVerified } : {}),
        ...(appRoleId !== undefined && appRoleId !== null
          ? { appRoleId: (appRoleId as string).trim() }
          : {}),
        ...(userType !== undefined ? { userType: userType as UserType } : {}),
        ...(parsedGradeLevelId !== undefined ? { gradeLevelId: parsedGradeLevelId } : {}),
        ...(parsedDepartmentId !== undefined ? { departmentId: parsedDepartmentId } : {}),
        ...(parsedStep !== undefined ? { step: parsedStep } : {}),
        ...(parsedSalary !== undefined ? { salary: parsedSalary } : {}),
        ...(dates?.dateOfBirth !== undefined ? { dateOfBirth: dates.dateOfBirth } : {}),
        ...(dates?.dateOfAppointment !== undefined
          ? { dateOfAppointment: dates.dateOfAppointment }
          : {}),
        ...(dates?.dateOfResignation !== undefined
          ? { dateOfResignation: dates.dateOfResignation }
          : {}),
        ...(dates?.dateOfTermination !== undefined
          ? { dateOfTermination: dates.dateOfTermination }
          : {}),
        ...(banksParsed.banks.length > 0 ? { banks: banksParsed.banks } : {}),
      });

      return res
        .status(201)
        .json({ success: true, message: "Staff created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create staff";
      return res.status(httpStatusForStaffError(message)).json({ success: false, message });
    }
  },

  listStaff: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const positionRaw =
        typeof req.query.position === "string" ? req.query.position : undefined;
      const position =
        positionRaw && STAFF_POSITIONS.includes(positionRaw)
          ? (positionRaw as StaffPosition)
          : undefined;
      if (positionRaw !== undefined && position === undefined) {
        return res.status(400).json({ success: false, message: "Invalid position" });
      }

      const employmentTypeRaw =
        typeof req.query.employmentType === "string" ? req.query.employmentType : undefined;
      const employmentType =
        employmentTypeRaw && EMPLOYMENT_TYPES.includes(employmentTypeRaw)
          ? (employmentTypeRaw as EmploymentType)
          : undefined;
      if (employmentTypeRaw !== undefined && employmentType === undefined) {
        return res.status(400).json({ success: false, message: "Invalid employmentType" });
      }

      const departmentId =
        typeof req.query.departmentId === "string" ? req.query.departmentId.trim() : undefined;
      const gradeLevelId =
        typeof req.query.gradeLevelId === "string" ? req.query.gradeLevelId.trim() : undefined;

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : statusRaw === "Active"
              ? Status.Active
              : statusRaw === "Inactive"
                ? Status.Inactive
                : statusRaw === "Archived"
                  ? Status.Archived
                  : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await staffService.listStaff({
        q,
        position,
        employmentType,
        ...(departmentId ? { departmentId } : {}),
        ...(gradeLevelId ? { gradeLevelId } : {}),
        status,
        page,
        limit,
      });
      return res.json({ success: true, message: "Staff retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/staff/{id}:
   *   get:
   *     summary: Get staff by ID
   *     tags: [Staff]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Staff found (includes gradeLevel and department when set) }
   *       404: { description: Staff not found }
   *   put:
   *     summary: Update staff
   *     tags: [Staff]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               StaffNumber: { type: string }
   *               email: { type: string }
   *               name: { type: string }
   *               position:
   *                 type: string
   *                 enum: [class_teacher, assistant_teacher, subject_teacher, principal, vice_principal, teacher, admin, other]
   *               employmentType:
   *                 type: string
   *                 enum: [Permanent, Contractual, Casual, Internship, Volunteer, PartTime, Temporary, Seasonal, ProjectBased, Other]
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *               profileImageUrl:
   *                 type: string
   *                 nullable: true
   *               gradeLevelId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *               departmentId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *               step:
   *                 type: integer
   *                 minimum: 0
   *               salary:
   *                 oneOf: [{ type: string }, { type: number }]
   *               dateOfBirth:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               dateOfAppointment:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               dateOfResignation:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *               dateOfTermination:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *     responses:
   *       200: { description: Staff updated }
   *       400: { description: Validation error }
   *       404: { description: Staff, grade level, or department not found }
   *       409: { description: Duplicate StaffNumber/email }
   *   delete:
   *     summary: Delete staff
   *     tags: [Staff]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Staff deleted }
   *       404: { description: Staff not found }
   */
  getStaffById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const staff = await staffService.getStaffById(id);
      if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });
      return res.json({ success: true, message: "Staff retrieved successfully", data: staff });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateStaff: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const {
        StaffNumber,
        email,
        name,
        position,
        employmentType,
        status,
        profileImageUrl,
        gradeLevelId,
        departmentId,
        step,
        salary,
      } = body;

      const hasAnyField =
        StaffNumber !== undefined ||
        email !== undefined ||
        name !== undefined ||
        position !== undefined ||
        employmentType !== undefined ||
        status !== undefined ||
        profileImageUrl !== undefined ||
        gradeLevelId !== undefined ||
        departmentId !== undefined ||
        step !== undefined ||
        salary !== undefined ||
        STAFF_DATE_FIELDS.some((field) => field in body);

      if (!hasAnyField) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      if (StaffNumber !== undefined && (typeof StaffNumber !== "string" || !StaffNumber.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "StaffNumber must be a non-empty string" });
      }
      if (email !== undefined && (typeof email !== "string" || !email.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "email must be a non-empty string" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (position !== undefined && position !== null && !STAFF_POSITIONS.includes(position as string)) {
        return res.status(400).json({ success: false, message: "Invalid position" });
      }
      if (
        employmentType !== undefined &&
        employmentType !== null &&
        !EMPLOYMENT_TYPES.includes(employmentType as string)
      ) {
        return res.status(400).json({ success: false, message: "Invalid employmentType" });
      }
      if (
        status !== undefined &&
        status !== null &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      if (profileImageUrl !== undefined && !isStringOrNullOrUndefined(profileImageUrl)) {
        return res
          .status(400)
          .json({ success: false, message: "profileImageUrl must be a string or null" });
      }

      const parsedGradeLevelId = parseOptionalUuid(gradeLevelId);
      if (parsedGradeLevelId === "invalid") {
        return res.status(400).json({ success: false, message: "gradeLevelId must be a uuid or null" });
      }
      const parsedDepartmentId = parseOptionalUuid(departmentId);
      if (parsedDepartmentId === "invalid") {
        return res.status(400).json({ success: false, message: "departmentId must be a uuid or null" });
      }

      const parsedStep = parseStepInput(step);
      if (parsedStep === "invalid") {
        return res.status(400).json({ success: false, message: "step must be a non-negative integer" });
      }
      const parsedSalary = parseSalaryInput(salary);
      if (parsedSalary === "invalid") {
        return res.status(400).json({ success: false, message: "salary must be a number or numeric string" });
      }

      const { dates, error: dateError } = parseStaffDates(body);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }

      const updated = await staffService.updateStaff(id, {
        ...(StaffNumber !== undefined ? { StaffNumber: StaffNumber as string } : {}),
        ...(email !== undefined ? { email: email as string } : {}),
        ...(name !== undefined ? { name: name as string } : {}),
        ...(position !== undefined && position !== null ? { position: position as StaffPosition } : {}),
        ...(employmentType !== undefined && employmentType !== null
          ? { employmentType: employmentType as EmploymentType }
          : {}),
        ...(status !== undefined ? { status: status as Status } : {}),
        ...(profileImageUrl !== undefined
          ? { profileImageUrl: profileImageUrl === "" ? null : (profileImageUrl as string | null) }
          : {}),
        ...(parsedGradeLevelId !== undefined ? { gradeLevelId: parsedGradeLevelId } : {}),
        ...(parsedDepartmentId !== undefined ? { departmentId: parsedDepartmentId } : {}),
        ...(parsedStep !== undefined ? { step: parsedStep } : {}),
        ...(parsedSalary !== undefined ? { salary: parsedSalary } : {}),
        ...(dates?.dateOfBirth !== undefined ? { dateOfBirth: dates.dateOfBirth } : {}),
        ...(dates?.dateOfAppointment !== undefined
          ? { dateOfAppointment: dates.dateOfAppointment }
          : {}),
        ...(dates?.dateOfResignation !== undefined
          ? { dateOfResignation: dates.dateOfResignation }
          : {}),
        ...(dates?.dateOfTermination !== undefined
          ? { dateOfTermination: dates.dateOfTermination }
          : {}),
      });

      return res.json({ success: true, message: "Staff updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update staff";
      return res.status(httpStatusForStaffError(message)).json({ success: false, message });
    }
  },

  deleteStaff: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await staffService.deleteStaff(id);
      return res.json({ success: true, message: "Staff deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete staff";
      return res.status(httpStatusForStaffError(message)).json({ success: false, message });
    }
  },
};
