import { Request, Response } from "express";
import { AttendanceStatus } from "@prisma/client";
import { attendanceRecordService } from "../services/attendanceRecordService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { getAuthenticatedUserId } from "../middlewares/auth";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseAttendanceStatus(raw: unknown): AttendanceStatus | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (
    raw === AttendanceStatus.Present ||
    raw === AttendanceStatus.Absent ||
    raw === AttendanceStatus.Late ||
    raw === AttendanceStatus.Excused ||
    raw === AttendanceStatus.HalfDay
  ) {
    return raw;
  }
  return "invalid";
}

function parsePositiveInt(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function parseReportQuery(req: Request, res: Response) {
  const sessionId = queryString(req.query, "sessionId");
  const termId = queryString(req.query, "termId");
  const status = parseAttendanceStatus(queryString(req.query, "status"));

  if (!sessionId?.trim()) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return null;
  }
  if (!termId?.trim()) {
    res.status(400).json({ success: false, message: "termId is required" });
    return null;
  }
  if (status === "invalid") {
    res.status(400).json({ success: false, message: "Invalid status" });
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    termId: termId.trim(),
    classId: queryString(req.query, "classId"),
    subclassId: queryString(req.query, "subclassId"),
    status,
    fromDate: queryString(req.query, "fromDate"),
    toDate: queryString(req.query, "toDate"),
  };
}

function requireMarkedById(req: Request, res: Response): string | null {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return null;
  }
  return userId;
}

/**
 * @openapi
 * /api/v1/attendance-records:
 *   post:
 *     summary: Record attendance for one student
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, termId, studentId, attendanceDate, checkInTime]
 *             properties:
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Present, Absent, Late, Excused, HalfDay]
 *               attendanceDate:
 *                 type: string
 *                 format: date
 *               checkInTime:
 *                 type: string
 *                 format: date-time
 *               checkOutTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               latitude:
 *                 type: number
 *                 nullable: true
 *               longitude:
 *                 type: number
 *                 nullable: true
 *               remarks:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Attendance record created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate attendance record
 *   get:
 *     summary: List attendance records
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Present, Absent, Late, Excused, HalfDay]
 *       - in: query
 *         name: attendanceDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: markedById
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attendance records list
 */
/**
 * @openapi
 * /api/v1/attendance-records/bulk:
 *   post:
 *     summary: Submit attendance for multiple students
 *     description: |
 *       Creates or updates attendance for each student for the same date.
 *       sessionId and termId are optional; when omitted, values are taken from the active period
 *       if attendanceDate falls within that period's startDate and endDate.
 *       attendanceDate is optional and defaults to the current date.
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [records]
 *             properties:
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               attendanceDate:
 *                 type: string
 *                 format: date
 *                 description: Defaults to current date when omitted
 *               records:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [studentId, checkInTime]
 *                   properties:
 *                     studentId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [Present, Absent, Late, Excused, HalfDay]
 *                     checkInTime:
 *                       type: string
 *                       format: date-time
 *                     checkOutTime:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     latitude:
 *                       type: number
 *                       nullable: true
 *                     longitude:
 *                       type: number
 *                       nullable: true
 *                     remarks:
 *                       type: string
 *                       nullable: true
 *           example:
 *             sessionId: "c1a2b3c4-d5e6-4789-a001-111111111102"
 *             termId: "d2b3c4d5-e6f7-4890-b012-222222222203"
 *             attendanceDate: "2026-07-08"
 *             records:
 *               - studentId: "e6f7a8b9-c0d1-4234-e012-345678907001"
 *                 status: "Present"
 *                 checkInTime: "2026-07-08T08:00:00.000Z"
 *               - studentId: "f7a8b9c0-d1e2-4345-f123-456789018002"
 *                 status: "Absent"
 *                 checkInTime: "2026-07-08T08:00:00.000Z"
 *                 remarks: "Sick"
 *     responses:
 *       201:
 *         description: Attendance records saved
 *       400:
 *         description: Validation error
 */
/**
 * @openapi
 * /api/v1/attendance-records/reports/by-date:
 *   get:
 *     summary: Attendance report grouped by date
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Present, Absent, Late, Excused, HalfDay]
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Attendance grouped by attendance date with student details
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attendance by-date report retrieved successfully
 *               data:
 *                 - attendanceDate: "2023-04-01"
 *                   students:
 *                     - id: "a1b2c3d4-e5f6-4789-a012-345678901234"
 *                       studentId: "e6f7a8b9-c0d1-4234-e012-345678907001"
 *                       admissionNumber: "STU-001"
 *                       studentName: "Chioma Adebayo"
 *                       status: "Present"
 *                       checkInTime: "2023-04-01T08:00:00.000Z"
 *                       checkOutTime: "2023-04-01T15:00:00.000Z"
 *                       remarks: null
 */
/**
 * @openapi
 * /api/v1/attendance-records/reports/student-summary:
 *   get:
 *     summary: Attendance summary per student with total attendance count
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Present, Absent, Late, Excused, HalfDay]
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Per-student attendance totals plus school opened days for the period
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attendance student summary report retrieved successfully
 *               data:
 *                 schoolOpenedDays: 20
 *                 students:
 *                   - studentId: "e6f7a8b9-c0d1-4234-e012-345678907001"
 *                     admissionNumber: "STU-001"
 *                     studentName: "Chioma Adebayo"
 *                     studentStatus: "Active"
 *                     classId: "c4d5e6f7-a8b9-4012-c012-345678905001"
 *                     totalAttendance: 15
 *                     totalPresent: 15
 *                     totalAbsent: 5
 */
/**
 * @openapi
 * /api/v1/attendance-records/reports/class-date:
 *   get:
 *     summary: Class attendance sheet for one date (null when no attendance taken)
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *       - in: query
 *         name: attendanceDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: All active students in the class/subclass with attendance for the date, or null
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Class date attendance report retrieved successfully
 *               data:
 *                 classId: "c4d5e6f7-a8b9-4012-c012-345678905001"
 *                 subclassId: null
 *                 attendanceDate: "2023-04-01"
 *                 students:
 *                   - studentId: "e6f7a8b9-c0d1-4234-e012-345678907001"
 *                     admissionNumber: "STU-001"
 *                     studentName: "Chioma Adebayo"
 *                     studentStatus: "Active"
 *                     classId: "c4d5e6f7-a8b9-4012-c012-345678905001"
 *                     subclassId: "s1a2b3c4-d5e6-4789-a001-111111111101"
 *                     attendance:
 *                       id: "a1b2c3d4-e5f6-4789-a012-345678901234"
 *                       status: "Present"
 *                       checkInTime: "2023-04-01T08:00:00.000Z"
 *                       checkOutTime: null
 *                       remarks: null
 *                       markedById: "77e7a005-b0a5-4a6e-897c-f827333924d4"
 *                   - studentId: "f7a8b9c0-d1e2-4345-f123-456789018002"
 *                     admissionNumber: "STU-002"
 *                     studentName: "John Doe"
 *                     studentStatus: "Active"
 *                     classId: "c4d5e6f7-a8b9-4012-c012-345678905001"
 *                     subclassId: null
 *                     attendance: null
 *       400:
 *         description: Validation error
 */
/**
 * @openapi
 * /api/v1/attendance-records/reports/student:
 *   get:
 *     summary: Attendance report for one student with school opened days
 *     tags: [AttendanceRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Present, Absent, Late, Excused, HalfDay]
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Student attendance records plus school opened days for the period
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Student attendance report retrieved successfully
 *               data:
 *                 schoolOpenedDays: 20
 *                 student:
 *                   studentId: "e6f7a8b9-c0d1-4234-e012-345678907001"
 *                   admissionNumber: "STU-001"
 *                   studentName: "Chioma Adebayo"
 *                   studentStatus: "Active"
 *                   classId: "c4d5e6f7-a8b9-4012-c012-345678905001"
 *                 totalAttendance: 2
 *                 attendance:
 *                   - id: "a1b2c3d4-e5f6-4789-a012-345678901234"
 *                     attendanceDate: "2023-04-01"
 *                     status: "Present"
 *                     checkInTime: "2023-04-01T08:00:00.000Z"
 *                     checkOutTime: "2023-04-01T15:00:00.000Z"
 *                     remarks: null
 *       400:
 *         description: Validation error
 *       404:
 *         description: Student not found
 */
export const attendanceRecordController = {
  create: async (req: Request, res: Response) => {
    try {
      const markedById = requireMarkedById(req, res);
      if (!markedById) return;

      const {
        sessionId,
        termId,
        studentId,
        status,
        attendanceDate,
        checkInTime,
        checkOutTime,
        latitude,
        longitude,
        remarks,
      } = req.body ?? {};

      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }
      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!attendanceDate) {
        return res.status(400).json({ success: false, message: "attendanceDate is required" });
      }
      if (!checkInTime) {
        return res.status(400).json({ success: false, message: "checkInTime is required" });
      }

      const parsedStatus = parseAttendanceStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const created = await attendanceRecordService.create({
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        studentId: studentId.trim(),
        status: parsedStatus,
        attendanceDate,
        checkInTime,
        checkOutTime,
        markedById,
        latitude,
        longitude,
        remarks,
      });

      return res.status(201).json({
        success: true,
        message: "Attendance record created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create attendance record");
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const markedById = requireMarkedById(req, res);
      if (!markedById) return;

      const { sessionId, termId, attendanceDate, records } = req.body ?? {};

      if (sessionId !== undefined && (typeof sessionId !== "string" || !sessionId.trim())) {
        return res.status(400).json({ success: false, message: "sessionId must be a non-empty string" });
      }
      if (termId !== undefined && (typeof termId !== "string" || !termId.trim())) {
        return res.status(400).json({ success: false, message: "termId must be a non-empty string" });
      }
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, message: "records must be a non-empty array" });
      }

      for (let i = 0; i < records.length; i++) {
        const entry = records[i];
        if (!entry || typeof entry !== "object") {
          return res.status(400).json({
            success: false,
            message: `records[${i}] must be an object`,
          });
        }
        if (!entry.studentId || typeof entry.studentId !== "string" || !entry.studentId.trim()) {
          return res.status(400).json({
            success: false,
            message: `records[${i}].studentId is required`,
          });
        }
        if (!entry.checkInTime) {
          return res.status(400).json({
            success: false,
            message: `records[${i}].checkInTime is required`,
          });
        }
        const parsedStatus = parseAttendanceStatus(entry.status);
        if (parsedStatus === "invalid") {
          return res.status(400).json({
            success: false,
            message: `records[${i}].status is invalid`,
          });
        }
      }

      const result = await attendanceRecordService.createMany({
        ...(typeof sessionId === "string" && sessionId.trim()
          ? { sessionId: sessionId.trim() }
          : {}),
        ...(typeof termId === "string" && termId.trim() ? { termId: termId.trim() } : {}),
        ...(attendanceDate !== undefined && attendanceDate !== null
          ? { attendanceDate }
          : {}),
        markedById,
        records,
      });

      return res.status(201).json({
        success: true,
        message: "Attendance records saved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to save attendance records");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const status = parseAttendanceStatus(queryString(req.query, "status"));
      if (status === "invalid") {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const result = await attendanceRecordService.list({
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        studentId: queryString(req.query, "studentId"),
        status,
        attendanceDate: queryString(req.query, "attendanceDate"),
        markedById: queryString(req.query, "markedById"),
        page: parsePositiveInt(req.query.page),
        limit: parsePositiveInt(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Attendance records retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve attendance records");
    }
  },

  reportByDate: async (req: Request, res: Response) => {
    try {
      const params = parseReportQuery(req, res);
      if (!params) return;

      const result = await attendanceRecordService.getReportByDate(params);

      return res.json({
        success: true,
        message: "Attendance by-date report retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve attendance by-date report");
    }
  },

  reportByClassDate: async (req: Request, res: Response) => {
    try {
      const classId = queryString(req.query, "classId");
      const subclassId = queryString(req.query, "subclassId");
      const attendanceDate = queryString(req.query, "attendanceDate");

      if (!classId?.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!attendanceDate?.trim()) {
        return res.status(400).json({ success: false, message: "attendanceDate is required" });
      }

      const result = await attendanceRecordService.getClassDateAttendanceReport({
        classId: classId.trim(),
        attendanceDate: attendanceDate.trim(),
        ...(subclassId?.trim() ? { subclassId: subclassId.trim() } : {}),
      });

      return res.json({
        success: true,
        message: "Class date attendance report retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve class date attendance report");
    }
  },

  reportByStudentSummary: async (req: Request, res: Response) => {
    try {
      const params = parseReportQuery(req, res);
      if (!params) return;

      const result = await attendanceRecordService.getReportByStudentSummary(params);

      return res.json({
        success: true,
        message: "Attendance student summary report retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve attendance student summary report");
    }
  },

  reportByStudent: async (req: Request, res: Response) => {
    try {
      const studentId = queryString(req.query, "studentId");
      if (!studentId?.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const params = parseReportQuery(req, res);
      if (!params) return;

      const result = await attendanceRecordService.getStudentAttendanceReport({
        ...params,
        studentId: studentId.trim(),
      });

      return res.json({
        success: true,
        message: "Student attendance report retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student attendance report");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await attendanceRecordService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Attendance record not found" });
      }

      return res.json({
        success: true,
        message: "Attendance record retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve attendance record");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { status, attendanceDate, checkInTime, checkOutTime, latitude, longitude, remarks } =
        req.body ?? {};

      const parsedStatus = parseAttendanceStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const markedById = getAuthenticatedUserId(req) ?? undefined;

      const updated = await attendanceRecordService.update(id, {
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(attendanceDate !== undefined ? { attendanceDate } : {}),
        ...(checkInTime !== undefined ? { checkInTime } : {}),
        ...(checkOutTime !== undefined ? { checkOutTime } : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(remarks !== undefined ? { remarks } : {}),
        ...(markedById ? { markedById } : {}),
      });

      return res.json({
        success: true,
        message: "Attendance record updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update attendance record");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await attendanceRecordService.delete(id);

      return res.json({
        success: true,
        message: "Attendance record deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete attendance record");
    }
  },
};
