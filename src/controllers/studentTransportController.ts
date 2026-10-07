import { Request, Response } from "express";
import { Status, TransportSubscriptionType } from "@prisma/client";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { studentTransportService } from "../services/studentTransportService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseIntOrUndefined, routeParam } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseStatus(raw: unknown): Status | "All" | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === "All") return "All";
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) return raw;
  return "invalid";
}

function parseSubscriptionType(
  raw: unknown
): TransportSubscriptionType | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (
    raw === TransportSubscriptionType.RoundTrip ||
    raw === TransportSubscriptionType.OneWaySchool ||
    raw === TransportSubscriptionType.OneWayHome
  ) {
    return raw;
  }
  return "invalid";
}

function parseBoolean(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  return "invalid";
}

/**
 * @openapi
 * /api/v1/student-transports:
 *   post:
 *     summary: Assign transport to a student
 *     description: |
 *       Unique per student + session + term.
 *       A student may have only one Active subscription.
 *       If session/term matches the current active period, any other Active
 *       subscription is auto-deactivated; otherwise Inactivate the existing
 *       Active subscription first. Existing (student, session, term) rows are
 *       updated instead of duplicated.
 *     tags: [StudentTransports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, routeId, bustopId]
 *             properties:
 *               studentId:
 *                 type: string
 *               routeId:
 *                 type: string
 *               bustopId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               classId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               subscriptionType:
 *                 type: string
 *                 enum: [RoundTrip, OneWaySchool, OneWayHome]
 *               canReversed:
 *                 type: boolean
 *                 default: false
 *                 description: |
 *                   When amount changes for an already posted subscription in the same period,
 *                   set true to counter-post the previous charge before posting the new plan.
 *                   Defaults to false and blocks the request.
 *     responses:
 *       201:
 *         description: Student transport assigned
 *   get:
 *     summary: List student transport assignments
 *     tags: [StudentTransports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: bustopId
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
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *       - in: query
 *         name: subscriptionType
 *         schema:
 *           type: string
 *           enum: [RoundTrip, OneWaySchool, OneWayHome]
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
 *         description: Student transports list
 */
/**
 * @openapi
 * /api/v1/student-transports/upsert:
 *   post:
 *     summary: Create or update a student transport assignment
 *     description: |
 *       Upserts by unique (studentId, sessionId, termId). Enforces at most one
 *       Active subscription per student (auto-deactivates when targeting the
 *       current active period).
 *     tags: [StudentTransports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, routeId, bustopId]
 *             properties:
 *               studentId:
 *                 type: string
 *               routeId:
 *                 type: string
 *               bustopId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               classId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               subscriptionType:
 *                 type: string
 *                 enum: [RoundTrip, OneWaySchool, OneWayHome]
 *               canReversed:
 *                 type: boolean
 *                 default: false
 *                 description: |
 *                   When amount changes for an already posted subscription in the same period,
 *                   set true to counter-post the previous charge before posting the new plan.
 *                   Defaults to false and blocks the request.
 *     responses:
 *       200:
 *         description: Student transport upserted
 */
/**
 * @openapi
 * /api/v1/student-transports/by-student/{studentId}:
 *   get:
 *     summary: Get transport assignment by student id
 *     description: Returns the student's current Active transport subscription.
 *     tags: [StudentTransports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student transport
 *       404:
 *         description: Not found
 */
/**
 * @openapi
 * /api/v1/student-transports/{id}:
 *   get:
 *     summary: Get a student transport assignment by ID
 *     tags: [StudentTransports]
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
 *         description: Student transport assignment
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a student transport assignment
 *     tags: [StudentTransports]
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
 *             properties:
 *               routeId:
 *                 type: string
 *               bustopId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               classId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               subscriptionType:
 *                 type: string
 *                 enum: [RoundTrip, OneWaySchool, OneWayHome]
 *               canReversed:
 *                 type: boolean
 *                 default: false
 *                 description: |
 *                   When amount changes for an already posted subscription in the same period,
 *                   set true to counter-post the previous charge before posting the new plan.
 *                   Defaults to false and blocks the request.
 *     responses:
 *       200:
 *         description: Student transport updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Remove a student transport assignment
 *     tags: [StudentTransports]
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
 *         description: Student transport assignment removed
 *       404:
 *         description: Not found
 */
export const studentTransportController = {
  create: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const {
        studentId,
        routeId,
        bustopId,
        status,
        subscriptionType,
        canReversed,
        sessionId,
        termId,
        classId,
      } = req.body ?? {};
      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!routeId || typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({ success: false, message: "routeId is required" });
      }
      if (!bustopId || typeof bustopId !== "string" || !bustopId.trim()) {
        return res.status(400).json({ success: false, message: "bustopId is required" });
      }

      const parsedStatus = parseStatus(status);
      if (parsedStatus === "invalid" || parsedStatus === "All") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived",
        });
      }

      const parsedSubscriptionType = parseSubscriptionType(subscriptionType);
      if (parsedSubscriptionType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "subscriptionType must be one of RoundTrip, OneWaySchool, OneWayHome",
        });
      }
      const parsedCanReversed = parseBoolean(canReversed);
      if (parsedCanReversed === "invalid") {
        return res.status(400).json({
          success: false,
          message: "canReversed must be a boolean",
        });
      }

      const created = await studentTransportService.create({
        studentId: studentId.trim(),
        routeId: routeId.trim(),
        bustopId: bustopId.trim(),
        actedBy,
        ...(parsedCanReversed !== undefined ? { canReversed: parsedCanReversed } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedSubscriptionType !== undefined
          ? { subscriptionType: parsedSubscriptionType }
          : {}),
        ...(typeof sessionId === "string" && sessionId.trim()
          ? { sessionId: sessionId.trim() }
          : {}),
        ...(typeof termId === "string" && termId.trim() ? { termId: termId.trim() } : {}),
        ...(typeof classId === "string" && classId.trim() ? { classId: classId.trim() } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Student transport assigned successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign student transport");
    }
  },

  upsert: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const {
        studentId,
        routeId,
        bustopId,
        status,
        subscriptionType,
        canReversed,
        sessionId,
        termId,
        classId,
      } = req.body ?? {};
      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!routeId || typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({ success: false, message: "routeId is required" });
      }
      if (!bustopId || typeof bustopId !== "string" || !bustopId.trim()) {
        return res.status(400).json({ success: false, message: "bustopId is required" });
      }

      const parsedStatus = parseStatus(status);
      if (parsedStatus === "invalid" || parsedStatus === "All") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived",
        });
      }

      const parsedSubscriptionType = parseSubscriptionType(subscriptionType);
      if (parsedSubscriptionType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "subscriptionType must be one of RoundTrip, OneWaySchool, OneWayHome",
        });
      }
      const parsedCanReversed = parseBoolean(canReversed);
      if (parsedCanReversed === "invalid") {
        return res.status(400).json({
          success: false,
          message: "canReversed must be a boolean",
        });
      }

      const row = await studentTransportService.upsert({
        studentId: studentId.trim(),
        routeId: routeId.trim(),
        bustopId: bustopId.trim(),
        actedBy,
        ...(parsedCanReversed !== undefined ? { canReversed: parsedCanReversed } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedSubscriptionType !== undefined
          ? { subscriptionType: parsedSubscriptionType }
          : {}),
        ...(typeof sessionId === "string" && sessionId.trim()
          ? { sessionId: sessionId.trim() }
          : {}),
        ...(typeof termId === "string" && termId.trim() ? { termId: termId.trim() } : {}),
        ...(typeof classId === "string" && classId.trim() ? { classId: classId.trim() } : {}),
      });

      return res.json({
        success: true,
        message: "Student transport upserted successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to upsert student transport");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const status = parseStatus(queryString(req.query, "status"));
      if (status === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived, All",
        });
      }

      const subscriptionType = parseSubscriptionType(
        queryString(req.query, "subscriptionType")
      );
      if (subscriptionType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "subscriptionType must be one of RoundTrip, OneWaySchool, OneWayHome",
        });
      }

      const result = await studentTransportService.list({
        studentId: queryString(req.query, "studentId"),
        routeId: queryString(req.query, "routeId"),
        bustopId: queryString(req.query, "bustopId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        classId: queryString(req.query, "classId"),
        status,
        ...(subscriptionType !== undefined ? { subscriptionType } : {}),
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Student transports retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student transports");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await studentTransportService.getById(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: "Student transport assignment not found" });
      }

      return res.json({
        success: true,
        message: "Student transport retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student transport");
    }
  },

  getByStudentId: async (req: Request, res: Response) => {
    try {
      const studentId = routeParam(req.params.studentId).trim();
      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const row = await studentTransportService.getByStudentId(studentId);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: "Student transport assignment not found" });
      }

      return res.json({
        success: true,
        message: "Student transport retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student transport");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        routeId,
        bustopId,
        status,
        subscriptionType,
        canReversed,
        sessionId,
        termId,
        classId,
      } = req.body ?? {};
      if (
        routeId === undefined &&
        bustopId === undefined &&
        status === undefined &&
        subscriptionType === undefined &&
        sessionId === undefined &&
        termId === undefined &&
        classId === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "At least one updatable field must be provided",
        });
      }

      const parsedStatus = parseStatus(status);
      if (parsedStatus === "invalid" || parsedStatus === "All") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived",
        });
      }

      const parsedSubscriptionType = parseSubscriptionType(subscriptionType);
      if (parsedSubscriptionType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "subscriptionType must be one of RoundTrip, OneWaySchool, OneWayHome",
        });
      }
      const parsedCanReversed = parseBoolean(canReversed);
      if (parsedCanReversed === "invalid") {
        return res.status(400).json({
          success: false,
          message: "canReversed must be a boolean",
        });
      }

      const updated = await studentTransportService.update(id, {
        actedBy,
        ...(parsedCanReversed !== undefined ? { canReversed: parsedCanReversed } : {}),
        ...(routeId !== undefined ? { routeId: String(routeId) } : {}),
        ...(bustopId !== undefined ? { bustopId: String(bustopId) } : {}),
        ...(sessionId !== undefined ? { sessionId: String(sessionId) } : {}),
        ...(termId !== undefined ? { termId: String(termId) } : {}),
        ...(classId !== undefined ? { classId: String(classId) } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedSubscriptionType !== undefined
          ? { subscriptionType: parsedSubscriptionType }
          : {}),
      });

      return res.json({
        success: true,
        message: "Student transport updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update student transport");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await studentTransportService.delete(id);

      return res.json({
        success: true,
        message: "Student transport assignment removed successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove student transport assignment");
    }
  },
};
