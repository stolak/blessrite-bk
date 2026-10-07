import { Request, Response } from "express";
import { studentService } from "../services/studentService";
import { Gender, StudentStatus } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { resolveParentGuardianEmail } from "../utils/studentContext";

function parseIsoDate(v: unknown): Date | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

const STUDENT_STATUSES: StudentStatus[] = [
  StudentStatus.Active,
  StudentStatus.Inactive,
  StudentStatus.Graduated,
  StudentStatus.Transferred,
  StudentStatus.Suspended,
  StudentStatus.Archived,
];

function parseStudentStatus(v: unknown): StudentStatus | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  return STUDENT_STATUSES.includes(v as StudentStatus) ? (v as StudentStatus) : undefined;
}

function parseGender(v: unknown): Gender | undefined {
  if (v === undefined || typeof v !== "string") return undefined;
  return v === Gender.male || v === Gender.female || v === Gender.other ? (v as Gender) : undefined;
}

/**
 * @openapi
 * /api/v1/students:
 *   post:
 *     summary: Create a student
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [admissionNumber, firstName, lastName, gender, dateOfBirth]
 *             properties:
 *               admissionNumber:
 *                 type: string
 *               firstName:
 *                 type: string
 *               middleName:
 *                 type: string
 *                 nullable: true
 *               lastName:
 *                 type: string
 *               studentEmail:
 *                 type: string
 *                 nullable: true
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 description: ISO date (e.g. YYYY-MM-DD)
 *               classId:
 *                 type: string
 *                 nullable: true
 *               subClassId:
 *                 type: string
 *                 nullable: true
 *               guardianName:
 *                 type: string
 *                 nullable: true
 *               guardianEmail:
 *                 type: string
 *                 nullable: true
 *               guardianContact:
 *                 type: string
 *                 nullable: true
 *               address:
 *                 type: string
 *                 nullable: true
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived]
 *     responses:
 *       201:
 *         description: Student created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invalid classId
 *       409:
 *         description: Duplicate admission number
 *       500:
 *         description: Server error
 *   get:
 *     summary: List students
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search admission number, names, emails, guardian fields
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Filter by school class id
 *       - in: query
 *         name: subClassId
 *         schema:
 *           type: string
 *         description: Filter by sub class id
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived, All]
 *         description: Defaults to Active only. Use All for every status.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Students list
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const studentController = {
  createStudent: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const {
        admissionNumber,
        firstName,
        middleName,
        lastName,
        studentEmail,
        gender,
        dateOfBirth,
        classId,
        subClassId,
        guardianName,
        guardianEmail,
        guardianContact,
        address,
        imageUrl,
        status,
      } = body;

      if (!admissionNumber || typeof admissionNumber !== "string" || !admissionNumber.trim()) {
        return res.status(400).json({ success: false, message: "admissionNumber is required" });
      }
      if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
        return res.status(400).json({ success: false, message: "firstName is required" });
      }
      if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
        return res.status(400).json({ success: false, message: "lastName is required" });
      }

      const g = parseGender(gender);
      if (g === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "gender must be male, female, or other" });
      }

      const dob = parseIsoDate(dateOfBirth);
      if (!dob) {
        return res.status(400).json({
          success: false,
          message: "dateOfBirth is required and must be a valid ISO date string",
        });
      }

      const st = parseStudentStatus(status);
      if (status !== undefined && st === undefined) {
        return res.status(400).json({
          success: false,
          message:
            "status must be Active, Inactive, Graduated, Transferred, Suspended, or Archived",
        });
      }

      let normalizedClassId: string | null | undefined = undefined;
      if (classId !== undefined && classId !== null) {
        if (typeof classId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "classId must be a string or null" });
        }
        normalizedClassId = classId.trim() === "" ? null : classId.trim();
      }

      let normalizedSubClassId: string | null | undefined = undefined;
      if (subClassId !== undefined && subClassId !== null) {
        if (typeof subClassId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "subClassId must be a string or null" });
        }
        normalizedSubClassId = subClassId.trim() === "" ? null : subClassId.trim();
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const student = await studentService.createStudent({
        admissionNumber: admissionNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: g,
        dateOfBirth: dob,
        ...(middleName !== undefined
          ? {
              middleName:
                middleName === null || middleName === ""
                  ? null
                  : typeof middleName === "string"
                    ? middleName.trim() || null
                    : null,
            }
          : {}),
        ...(studentEmail !== undefined
          ? {
              studentEmail:
                studentEmail === null || studentEmail === ""
                  ? null
                  : typeof studentEmail === "string"
                    ? studentEmail.trim() || null
                    : null,
            }
          : {}),
        ...(normalizedClassId !== undefined ? { classId: normalizedClassId } : {}),
        ...(normalizedSubClassId !== undefined ? { subClassId: normalizedSubClassId } : {}),
        ...(guardianName !== undefined
          ? {
              guardianName:
                guardianName === null || guardianName === ""
                  ? null
                  : typeof guardianName === "string"
                    ? guardianName.trim() || null
                    : null,
            }
          : {}),
        ...(guardianEmail !== undefined
          ? {
              guardianEmail:
                guardianEmail === null || guardianEmail === ""
                  ? null
                  : typeof guardianEmail === "string"
                    ? guardianEmail.trim() || null
                    : null,
            }
          : {}),
        ...(guardianContact !== undefined
          ? {
              guardianContact:
                guardianContact === null || guardianContact === ""
                  ? null
                  : typeof guardianContact === "string"
                    ? guardianContact.trim() || null
                    : null,
            }
          : {}),
        ...(address !== undefined
          ? {
              address:
                address === null || address === ""
                  ? null
                  : typeof address === "string"
                    ? address.trim() || null
                    : null,
            }
          : {}),
        ...(imageUrl !== undefined
          ? {
              imageUrl:
                imageUrl === null || imageUrl === ""
                  ? null
                  : typeof imageUrl === "string"
                    ? imageUrl.trim() || null
                    : null,
            }
          : {}),
        ...(st !== undefined ? { status: st } : {}),
        createdById,
      });

      return res.status(201).json({
        success: true,
        message: "Student created successfully",
        data: student,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create student";
      const code =
        message === "Invalid classId" || message === "Invalid subClassId"
          ? 404
          : message.includes("already exists")
            ? 409
            : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listStudents: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subClassId =
        typeof req.query.subClassId === "string" ? req.query.subClassId : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;

      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : parseStudentStatus(statusRaw);

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message:
            "status must be Active, Inactive, Graduated, Transferred, Suspended, Archived, or All",
        });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await studentService.listStudents({
        q,
        ...(classId !== undefined && classId.trim() !== "" ? { classId: classId.trim() } : {}),
        ...(subClassId !== undefined && subClassId.trim() !== ""
          ? { subClassId: subClassId.trim() }
          : {}),
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Students retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve students",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/students/me/guardian:
   *   get:
   *     summary: List students linked to the authenticated parent guardian email
   *     description: |
   *       Uses the logged-in parent user's email to find students whose guardianEmail matches.
   *     tags: [Students]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived, All]
   *         description: Defaults to Active when omitted
   *     responses:
   *       200:
   *         description: Students linked to the parent guardian email
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: User is not a parent
   *       500:
   *         description: Server error
   */
  listGuardianStudents: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : parseStudentStatus(statusRaw);

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message:
            "status must be Active, Inactive, Graduated, Transferred, Suspended, Archived, or All",
        });
      }

      const guardianEmail = await resolveParentGuardianEmail(userId);
      const result = await studentService.listByGuardianEmail(guardianEmail, { status });

      return res.json({
        success: true,
        message: "Guardian students retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve guardian students";
      const m = message.toLowerCase();
      const code = m.includes("unauthorized")
        ? 401
        : m.includes("only available to parent")
          ? 403
          : m.includes("invalid") || m.includes("required")
            ? 400
            : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/students/class/bulk:
   *   patch:
   *     summary: Bulk update student class, subclass, and/or status
   *     tags: [Students]
   *     security:
   *       - bearerAuth: []
   *     description: Updates classId, subClassId, and/or status for every student in studentIds. Provide at least one of classId or subClassId (use null to clear). When only subClassId is set and the subclass is linked to a class, classId is set automatically. status may be included to change all listed students to the same status.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studentIds]
   *             properties:
   *               studentIds:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: string
   *                 description: Student ids to update (duplicates are ignored)
   *               classId:
   *                 type: string
   *                 nullable: true
   *                 description: School class id to assign, or null to clear. Omit to leave class unchanged.
   *               subClassId:
   *                 type: string
   *                 nullable: true
   *                 description: Sub class id to assign, or null to clear. Omit to leave subclass unchanged.
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived]
   *                 description: Optional. Student status to apply to every student in studentIds. Omit to leave status unchanged.
   *     responses:
   *       200:
   *         description: Students updated
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Student, class, or subclass not found
   *       500:
   *         description: Server error
   */
  bulkUpdateStudentClassAndSubClassAndStatus: async (req: Request, res: Response) => {
    try {
      const { studentIds, classId, subClassId, status } = req.body ?? {};

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "studentIds is required and must be a non-empty array",
        });
      }

      const normalizedStudentIds: string[] = [];
      for (const [idx, id] of studentIds.entries()) {
        if (typeof id !== "string" || !id.trim()) {
          return res.status(400).json({
            success: false,
            message: `studentIds[${idx}] must be a non-empty string`,
          });
        }
        normalizedStudentIds.push(id.trim());
      }

      if (classId === undefined && subClassId === undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "At least one of classId or subClassId or status must be provided",
        });
      }

      let normalizedClassId: string | null | undefined = undefined;
      if (classId !== undefined) {
        if (classId !== null && typeof classId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "classId must be a string or null" });
        }
        normalizedClassId =
          classId === null || classId === ""
            ? null
            : typeof classId === "string"
              ? classId.trim() || null
              : null;
      }

      let normalizedSubClassId: string | null | undefined = undefined;
      if (subClassId !== undefined) {
        if (subClassId !== null && typeof subClassId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "subClassId must be a string or null" });
        }
        normalizedSubClassId =
          subClassId === null || subClassId === ""
            ? null
            : typeof subClassId === "string"
              ? subClassId.trim() || null
              : null;
      }

      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await studentService.bulkUpdateStudentClassAndSubClassAndStatus({
        studentIds: normalizedStudentIds,
        ...(normalizedClassId !== undefined ? { classId: normalizedClassId } : {}),
        ...(normalizedSubClassId !== undefined ? { subClassId: normalizedSubClassId } : {}),
        status: status as StudentStatus | undefined,
      });

      return res.json({
        success: true,
        message: "Students updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk update student class";
      const statusCode =
        message.startsWith("Student not found") ||
        message === "Invalid classId" ||
        message === "Invalid subClassId" ||
        message === "subClassId does not belong to the specified classId"
          ? 404
          : message.includes("must be provided") || message.includes("must not be empty")
            ? 400
            : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/students/{id}:
   *   get:
   *     summary: Get a student by ID
   *     tags: [Students]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Student details
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Student not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a student
   *     tags: [Students]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               admissionNumber:
   *                 type: string
   *               firstName:
   *                 type: string
   *               middleName:
   *                 type: string
   *                 nullable: true
   *               lastName:
   *                 type: string
   *               studentEmail:
   *                 type: string
   *                 nullable: true
   *               gender:
   *                 type: string
   *                 enum: [male, female, other]
   *               dateOfBirth:
   *                 type: string
   *                 format: date
   *               classId:
   *                 type: string
   *                 nullable: true
   *               subClassId:
   *                 type: string
   *                 nullable: true
   *               guardianName:
   *                 type: string
   *                 nullable: true
   *               guardianEmail:
   *                 type: string
   *                 nullable: true
   *               guardianContact:
   *                 type: string
   *                 nullable: true
 *               address:
 *                 type: string
 *                 nullable: true
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived]
 *     responses:
 *       200:
 *         description: Student updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Student or class not found
 *       409:
 *         description: Duplicate admission number
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete a student
 *     tags: [Students]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Student deleted
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Student not found
   *       500:
   *         description: Server error
   */
  getStudentById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const student = await studentService.getStudentById(id);
      if (!student) return res.status(404).json({ success: false, message: "Student not found" });

      return res.json({
        success: true,
        message: "Student retrieved successfully",
        data: student,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student",
        error: error?.message,
      });
    }
  },

  updateStudent: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const body = req.body ?? {};
      const {
        admissionNumber,
        firstName,
        middleName,
        lastName,
        studentEmail,
        gender,
        dateOfBirth,
        classId,
        subClassId,
        guardianName,
        guardianEmail,
        guardianContact,
        address,
        imageUrl,
        status,
      } = body;

      if (
        admissionNumber !== undefined &&
        (typeof admissionNumber !== "string" || !admissionNumber.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "admissionNumber must be a non-empty string when provided",
        });
      }
      if (firstName !== undefined && (typeof firstName !== "string" || !firstName.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "firstName must be a non-empty string when provided" });
      }
      if (lastName !== undefined && (typeof lastName !== "string" || !lastName.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "lastName must be a non-empty string when provided" });
      }

      let genderParsed: Gender | undefined;
      if (gender !== undefined) {
        genderParsed = parseGender(gender);
        if (genderParsed === undefined) {
          return res
            .status(400)
            .json({ success: false, message: "gender must be male, female, or other" });
        }
      }

      let dob: Date | undefined;
      if (dateOfBirth !== undefined) {
        const parsed = parseIsoDate(dateOfBirth);
        if (!parsed) {
          return res.status(400).json({
            success: false,
            message: "dateOfBirth must be a valid ISO date string when provided",
          });
        }
        dob = parsed;
      }

      const st = parseStudentStatus(status);
      if (status !== undefined && st === undefined) {
        return res.status(400).json({
          success: false,
          message:
            "status must be Active, Inactive, Graduated, Transferred, Suspended, or Archived",
        });
      }

      let normalizedClassId: string | null | undefined = undefined;
      if (classId !== undefined) {
        if (classId !== null && typeof classId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "classId must be a string or null" });
        }
        normalizedClassId =
          classId === null || classId === ""
            ? null
            : typeof classId === "string"
              ? classId.trim() || null
              : null;
      }

      let normalizedSubClassId: string | null | undefined = undefined;
      if (subClassId !== undefined) {
        if (subClassId !== null && typeof subClassId !== "string") {
          return res
            .status(400)
            .json({ success: false, message: "subClassId must be a string or null" });
        }
        normalizedSubClassId =
          subClassId === null || subClassId === ""
            ? null
            : typeof subClassId === "string"
              ? subClassId.trim() || null
              : null;
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await studentService.updateStudent(id, {
        ...(admissionNumber !== undefined ? { admissionNumber: admissionNumber.trim() } : {}),
        ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
        ...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
        ...(middleName !== undefined
          ? {
              middleName:
                middleName === null || middleName === ""
                  ? null
                  : typeof middleName === "string"
                    ? middleName.trim() || null
                    : null,
            }
          : {}),
        ...(studentEmail !== undefined
          ? {
              studentEmail:
                studentEmail === null || studentEmail === ""
                  ? null
                  : typeof studentEmail === "string"
                    ? studentEmail.trim() || null
                    : null,
            }
          : {}),
        ...(genderParsed !== undefined ? { gender: genderParsed } : {}),
        ...(dob !== undefined ? { dateOfBirth: dob } : {}),
        ...(normalizedClassId !== undefined ? { classId: normalizedClassId } : {}),
        ...(normalizedSubClassId !== undefined ? { subClassId: normalizedSubClassId } : {}),
        ...(guardianName !== undefined
          ? {
              guardianName:
                guardianName === null || guardianName === ""
                  ? null
                  : typeof guardianName === "string"
                    ? guardianName.trim() || null
                    : null,
            }
          : {}),
        ...(guardianEmail !== undefined
          ? {
              guardianEmail:
                guardianEmail === null || guardianEmail === ""
                  ? null
                  : typeof guardianEmail === "string"
                    ? guardianEmail.trim() || null
                    : null,
            }
          : {}),
        ...(guardianContact !== undefined
          ? {
              guardianContact:
                guardianContact === null || guardianContact === ""
                  ? null
                  : typeof guardianContact === "string"
                    ? guardianContact.trim() || null
                    : null,
            }
          : {}),
        ...(address !== undefined
          ? {
              address:
                address === null || address === ""
                  ? null
                  : typeof address === "string"
                    ? address.trim() || null
                    : null,
            }
          : {}),
        ...(imageUrl !== undefined
          ? {
              imageUrl:
                imageUrl === null || imageUrl === ""
                  ? null
                  : typeof imageUrl === "string"
                    ? imageUrl.trim() || null
                    : null,
            }
          : {}),
        ...(st !== undefined ? { status: st } : {}),
      });

      return res.json({ success: true, message: "Student updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update student";
      const statusCode =
        message === "Invalid classId" || message === "Invalid subClassId"
          ? 404
          : message.includes("Record to update not found")
            ? 404
            : message.includes("already exists")
              ? 409
              : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  deleteStudent: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await studentService.deleteStudent(id);
      return res.json({ success: true, message: "Student deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete student";
      const statusCode = message.includes("Record to delete does not exist")
        ? 404
        : message.includes("Cannot delete")
          ? 409
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },
};
