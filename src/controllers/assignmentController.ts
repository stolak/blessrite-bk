import { Request, Response } from "express";
import { AssignmentStatus } from "@prisma/client";
import { assignmentService } from "../services/assignmentService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isStringOrNullOrUndefined } from "../utils/request";

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

function parseDeadline(raw: unknown): Date | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === "string" && raw.trim()) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "invalid";
    return date;
  }
  return "invalid";
}

function parseUrlArray(raw: unknown): string[] | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return "invalid";
  if (!raw.every((item) => typeof item === "string")) return "invalid";
  return raw;
}

function getAuthenticatedUserId(req: Request): string | null {
  return (req as { user?: { id: string } }).user?.id?.trim() || null;
}

/**
 * @openapi
 * /api/v1/assignments:
 *   post:
 *     summary: Create an assignment with optional attachments
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic, question, classId, subjectId, sessionId, termId]
 *             properties:
 *               topic:
 *                 type: string
 *               question:
 *                 type: string
 *               classId:
 *                 type: string
 *               subjectId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               assignmentComponentId:
 *                 type: string
 *                 nullable: true
 *               deadline:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Pending, Submitted, Graded]
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Assignment created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *   get:
 *     summary: List assignments
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
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
 *       - in: query
 *         name: createdById
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignments list
 *       500:
 *         description: Server error
 */
export const assignmentController = {
  create: async (req: Request, res: Response) => {
    try {
      const createdById = getAuthenticatedUserId(req);
      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        topic,
        question,
        classId,
        subjectId,
        sessionId,
        termId,
        assignmentComponentId,
        deadline,
        status,
        attachments,
      } = req.body ?? {};

      if (!topic || typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ success: false, message: "topic is required" });
      }
      if (!question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ success: false, message: "question is required" });
      }
      for (const [field, value] of [
        ["classId", classId],
        ["subjectId", subjectId],
        ["sessionId", sessionId],
        ["termId", termId],
      ] as const) {
        if (!value || typeof value !== "string" || !value.trim()) {
          return res.status(400).json({ success: false, message: `${field} is required` });
        }
      }
      if (!isStringOrNullOrUndefined(assignmentComponentId)) {
        return res.status(400).json({
          success: false,
          message: "assignmentComponentId must be a string or null",
        });
      }

      const parsedDeadline = parseDeadline(deadline);
      if (parsedDeadline === "invalid") {
        return res.status(400).json({ success: false, message: "deadline must be a valid date-time" });
      }

      const parsedStatus = parseAssignmentStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, Submitted, or Graded",
        });
      }

      const parsedAttachments = parseUrlArray(attachments);
      if (parsedAttachments === "invalid") {
        return res.status(400).json({
          success: false,
          message: "attachments must be an array of strings",
        });
      }

      const created = await assignmentService.create({
        topic: topic.trim(),
        question: question.trim(),
        classId: classId.trim(),
        subjectId: subjectId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        createdById,
        ...(assignmentComponentId !== undefined ? { assignmentComponentId } : {}),
        ...(parsedDeadline !== undefined ? { deadline: parsedDeadline } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedAttachments !== undefined ? { attachments: parsedAttachments } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Assignment created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create assignment");
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

      const result = await assignmentService.list({
        classId: queryString(req.query, "classId"),
        subjectId: queryString(req.query, "subjectId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        createdById: queryString(req.query, "createdById"),
        ...(parsedStatus ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Assignments retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assignments");
    }
  },

  /**
   * @openapi
   * /api/v1/assignments/{id}:
   *   get:
   *     summary: Get assignment by ID
   *     tags: [Assignments]
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
   *         description: Assignment details
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update an assignment
   *     tags: [Assignments]
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
   *         description: Assignment updated
   *       404:
   *         description: Not found
   *   delete:
   *     summary: Delete an assignment
   *     tags: [Assignments]
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
   *         description: Assignment deleted
   *       404:
   *         description: Not found
   *       409:
   *         description: Assignment has student submissions
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await assignmentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Assignment not found" });
      }

      return res.json({
        success: true,
        message: "Assignment retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assignment");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        topic,
        question,
        classId,
        subjectId,
        sessionId,
        termId,
        assignmentComponentId,
        deadline,
        status,
      } = req.body ?? {};

      if (
        topic === undefined &&
        question === undefined &&
        classId === undefined &&
        subjectId === undefined &&
        sessionId === undefined &&
        termId === undefined &&
        assignmentComponentId === undefined &&
        deadline === undefined &&
        status === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      for (const [field, value] of [
        ["topic", topic],
        ["question", question],
        ["classId", classId],
        ["subjectId", subjectId],
        ["sessionId", sessionId],
        ["termId", termId],
      ] as const) {
        if (value !== undefined && (typeof value !== "string" || !value.trim())) {
          return res.status(400).json({ success: false, message: `${field} must be a non-empty string` });
        }
      }
      if (assignmentComponentId !== undefined && !isStringOrNullOrUndefined(assignmentComponentId)) {
        return res.status(400).json({
          success: false,
          message: "assignmentComponentId must be a string or null",
        });
      }

      const parsedDeadline = parseDeadline(deadline);
      if (parsedDeadline === "invalid") {
        return res.status(400).json({ success: false, message: "deadline must be a valid date-time" });
      }

      const parsedStatus = parseAssignmentStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, Submitted, or Graded",
        });
      }

      const updated = await assignmentService.update(id, {
        ...(topic !== undefined ? { topic } : {}),
        ...(question !== undefined ? { question } : {}),
        ...(classId !== undefined ? { classId } : {}),
        ...(subjectId !== undefined ? { subjectId } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(termId !== undefined ? { termId } : {}),
        ...(assignmentComponentId !== undefined ? { assignmentComponentId } : {}),
        ...(parsedDeadline !== undefined ? { deadline: parsedDeadline } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Assignment updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update assignment");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await assignmentService.delete(id);

      return res.json({
        success: true,
        message: "Assignment deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete assignment");
    }
  },

  /**
   * @openapi
   * /api/v1/assignments/{id}/attachments:
   *   post:
   *     summary: Add an attachment to an assignment
   *     tags: [Assignments]
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
   *       404:
   *         description: Assignment not found
   */
  addAttachment: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { url } = req.body ?? {};
      if (!url || typeof url !== "string" || !url.trim()) {
        return res.status(400).json({ success: false, message: "url is required" });
      }

      const updated = await assignmentService.addAttachment(id, url);

      return res.json({
        success: true,
        message: "Assignment attachment added successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to add assignment attachment");
    }
  },

  /**
   * @openapi
   * /api/v1/assignments/{id}/attachments/{attachmentId}:
   *   delete:
   *     summary: Remove an attachment from an assignment
   *     tags: [Assignments]
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
   *       404:
   *         description: Not found
   */
  removeAttachment: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const attachmentId = typeof req.params.attachmentId === "string" ? req.params.attachmentId.trim() : "";
      if (!attachmentId) {
        return res.status(400).json({ success: false, message: "attachmentId is required" });
      }

      const updated = await assignmentService.removeAttachment(id, attachmentId);

      return res.json({
        success: true,
        message: "Assignment attachment removed successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove assignment attachment");
    }
  },
};
