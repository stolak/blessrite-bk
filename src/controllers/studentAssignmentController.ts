import { Request, Response } from "express";
import { AssignmentStatus } from "@prisma/client";
import { studentAssignmentService } from "../services/studentAssignmentService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isNumberOrString, isStringOrNullOrUndefined } from "../utils/request";
import { parseBodyDecimal } from "../utils/assessmentHttp";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { resolveStudentAcademicContext } from "../utils/studentContext";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseAssignmentStatus(raw: unknown): AssignmentStatus | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === AssignmentStatus.Pending || raw === AssignmentStatus.Submitted || raw === AssignmentStatus.Graded) {
    return raw;
  }
  return "invalid";
}

function parseUrlArray(raw: unknown): string[] | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return "invalid";
  if (!raw.every((item) => typeof item === "string")) return "invalid";
  return raw;
}

/**
 * @openapi
 * /api/v1/student-assignments:
 *   post:
 *     summary: Create or update a student assignment submission
 *     tags: [StudentAssignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignmentId, studentId, classId, sessionId, termId]
 *             properties:
 *               assignmentId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               answer:
 *                 type: string
 *                 nullable: true
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Student assignment created
 *       200:
 *         description: Student assignment updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *   get:
 *     summary: List student assignments
 *     tags: [StudentAssignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: assignmentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: studentId
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
 *         name: sessionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Submitted, Graded]
 *     responses:
 *       200:
 *         description: Student assignments list
 */
export const studentAssignmentController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        assignmentId,
        studentId,
        classId,
        subclassId,
        sessionId,
        termId,
        answer,
        attachments,
      } = req.body ?? {};

      for (const [field, value] of [
        ["assignmentId", assignmentId],
        ["studentId", studentId],
        ["classId", classId],
        ["sessionId", sessionId],
        ["termId", termId],
      ] as const) {
        if (!value || typeof value !== "string" || !value.trim()) {
          return res.status(400).json({ success: false, message: `${field} is required` });
        }
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(answer)) {
        return res.status(400).json({ success: false, message: "answer must be a string or null" });
      }

      const parsedAttachments = parseUrlArray(attachments);
      if (parsedAttachments === "invalid") {
        return res.status(400).json({
          success: false,
          message: "attachments must be an array of strings",
        });
      }

      const { studentAssignment, created } = await studentAssignmentService.create({
        assignmentId: assignmentId.trim(),
        studentId: studentId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        ...(subclassId !== undefined ? { subclassId } : {}),
        ...(answer !== undefined ? { answer } : {}),
        ...(parsedAttachments !== undefined ? { attachments: parsedAttachments } : {}),
      });

      return res.status(created ? 201 : 200).json({
        success: true,
        message: created
          ? "Student assignment created successfully"
          : "Student assignment updated successfully",
        data: studentAssignment,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create student assignment");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const parsedStatus = parseAssignmentStatus(queryString(req.query, "status"));
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, Submitted, or Graded",
        });
      }

      const result = await studentAssignmentService.list({
        assignmentId: queryString(req.query, "assignmentId"),
        studentId: queryString(req.query, "studentId"),
        classId: queryString(req.query, "classId"),
        subclassId: queryString(req.query, "subclassId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        ...(parsedStatus ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Student assignments retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student assignments");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/me:
   *   get:
   *     summary: List student assignments for the authenticated student
   *     description: |
   *       Resolves studentId from the logged-in student user. Uses the student's class
   *       when classId is omitted, and the active period session/term when those are omitted.
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: assignmentId
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
   *         name: sessionId
   *         schema:
   *           type: string
   *       - in: query
   *         name: termId
   *         schema:
   *           type: string
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [Pending, Submitted, Graded]
   *     responses:
   *       200:
   *         description: Student assignments list for the authenticated student
   *       400:
   *         description: Validation error or no active period
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: User is not a student
   *       404:
   *         description: No linked student profile
   *       500:
   *         description: Server error
   */
  listMy: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const parsedStatus = parseAssignmentStatus(queryString(req.query, "status"));
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, Submitted, or Graded",
        });
      }

      const context = await resolveStudentAcademicContext({
        userId,
        classId: queryString(req.query, "classId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      const result = await studentAssignmentService.list({
        studentId: context.studentId,
        classId: context.classId,
        sessionId: context.sessionId,
        termId: context.termId,
        assignmentId: queryString(req.query, "assignmentId"),
        subclassId: queryString(req.query, "subclassId"),
        ...(parsedStatus ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Student assignments retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student assignments");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/untreated:
   *   get:
   *     summary: List class assignments not yet started by a student for registered subjects
   *     description: |
   *       Returns assignments for the student's class, session, and term whose subject
   *       the student is registered for, excluding assignments that already have a
   *       student assignment record.
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: studentId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: classId
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
   *     responses:
   *       200:
   *         description: Untreated assignments list
   *       400:
   *         description: Validation error
   *       500:
   *         description: Server error
   */
  listUntreated: async (req: Request, res: Response) => {
    try {
      const studentId = queryString(req.query, "studentId");
      const classId = queryString(req.query, "classId");
      const sessionId = queryString(req.query, "sessionId");
      const termId = queryString(req.query, "termId");

      if (!studentId?.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!classId?.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId?.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId?.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }

      const data = await studentAssignmentService.listUntreated({
        studentId: studentId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
      });

      return res.json({
        success: true,
        message: "Untreated student assignments retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve untreated student assignments");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/me/untreated:
   *   get:
   *     summary: List untreated assignments for the authenticated student
   *     description: |
   *       Resolves studentId from the logged-in student user. Uses the student's class
   *       when classId is omitted, and the active period session/term when those are omitted.
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: classId
   *         schema:
   *           type: string
   *       - in: query
   *         name: sessionId
   *         schema:
   *           type: string
   *       - in: query
   *         name: termId
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Untreated assignments list for the authenticated student
   *       400:
   *         description: Validation error or no active period
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: User is not a student
   *       404:
   *         description: No linked student profile
   *       500:
   *         description: Server error
   */
  listMyUntreated: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const context = await resolveStudentAcademicContext({
        userId,
        classId: queryString(req.query, "classId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      const data = await studentAssignmentService.listUntreated(context);

      return res.json({
        success: true,
        message: "Untreated student assignments retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve untreated student assignments");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/{id}:
   *   get:
   *     summary: Get student assignment by ID
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Student assignment details
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update a student assignment (answer, score, or status)
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               answer:
   *                 type: string
   *                 nullable: true
   *               score:
   *                 type: number
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Pending, Submitted, Graded]
   *     responses:
   *       200:
   *         description: Student assignment updated
   *       404:
   *         description: Not found
   *   delete:
   *     summary: Delete a student assignment
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Student assignment deleted
   *       404:
   *         description: Not found
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await studentAssignmentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Student assignment not found" });
      }

      return res.json({
        success: true,
        message: "Student assignment retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student assignment");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { answer, score, status } = req.body ?? {};

      if (answer === undefined && score === undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }
      if (answer !== undefined && !isStringOrNullOrUndefined(answer)) {
        return res.status(400).json({ success: false, message: "answer must be a string or null" });
      }

      const parsedStatus = parseAssignmentStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, Submitted, or Graded",
        });
      }

      let parsedScore: string | number | null | undefined;
      if (score !== undefined) {
        if (score === null) {
          parsedScore = null;
        } else if (isNumberOrString(score)) {
          const bodyScore = parseBodyDecimal(score, "score");
          if (bodyScore === "missing" || bodyScore === "invalid") {
            return res.status(400).json({ success: false, message: "score must be a number" });
          }
          parsedScore = bodyScore;
        } else {
          return res.status(400).json({ success: false, message: "score must be a number or null" });
        }
      }

      const gradedById = parsedScore !== undefined && parsedScore !== null ? getAuthenticatedUserId(req) : undefined;
      if (parsedScore !== undefined && parsedScore !== null && !gradedById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const updated = await studentAssignmentService.update(id, {
        ...(answer !== undefined ? { answer } : {}),
        ...(parsedScore !== undefined ? { score: parsedScore } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(gradedById ? { gradedById } : {}),
      });

      return res.json({
        success: true,
        message: "Student assignment updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update student assignment");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await studentAssignmentService.delete(id);

      return res.json({
        success: true,
        message: "Student assignment deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete student assignment");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/{id}/attachments:
   *   post:
   *     summary: Add an attachment to a student assignment
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [url]
   *             properties:
   *               url:
   *                 type: string
   *     responses:
   *       200:
   *         description: Attachment added
   */
  addAttachment: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { url } = req.body ?? {};
      if (!url || typeof url !== "string" || !url.trim()) {
        return res.status(400).json({ success: false, message: "url is required" });
      }

      const updated = await studentAssignmentService.addAttachment(id, url);

      return res.json({
        success: true,
        message: "Student assignment attachment added successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to add student assignment attachment");
    }
  },

  /**
   * @openapi
   * /api/v1/student-assignments/{id}/attachments/{attachmentId}:
   *   delete:
   *     summary: Remove an attachment from a student assignment
   *     tags: [StudentAssignments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: path
   *         name: attachmentId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Attachment removed
   */
  removeAttachment: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const attachmentId = typeof req.params.attachmentId === "string" ? req.params.attachmentId.trim() : "";
      if (!attachmentId) {
        return res.status(400).json({ success: false, message: "attachmentId is required" });
      }

      const updated = await studentAssignmentService.removeAttachment(id, attachmentId);

      return res.json({
        success: true,
        message: "Student assignment attachment removed successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove student assignment attachment");
    }
  },
};
