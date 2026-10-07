import { Request, Response } from "express";
import { Direction, StudentTransportationRegisterStatus } from "@prisma/client";
import { studentTransportationRegisterService } from "../services/studentTransportationRegisterService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { parseIntOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseDirection(raw: unknown): Direction | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === Direction.HomeToSchool || raw === Direction.SchoolToHome) return raw;
  return "invalid";
}

function parseRegisterStatus(
  raw: unknown
): StudentTransportationRegisterStatus | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (
    raw === StudentTransportationRegisterStatus.Boarding ||
    raw === StudentTransportationRegisterStatus.OnTransit ||
    raw === StudentTransportationRegisterStatus.DroppedOff
  ) {
    return raw;
  }
  return "invalid";
}

/**
 * @openapi
 * /api/v1/student-transportation-registers/bulk:
 *   post:
 *     summary: Bulk-register students for a SchoolToHome trip
 *     description: |
 *       Registers multiple students on one trip in a single request.
 *       Only allowed when the trip direction is SchoolToHome.
 *       HomeToSchool bulk registration is rejected.
 *       Status is derived automatically: Boarding (trip not started), OnTransit (trip InProgress), DroppedOff (endTime set).
 *     tags: [StudentTransportationRegisters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleTripId, studentIds]
 *             properties:
 *               vehicleTripId:
 *                 type: string
 *               studentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional while Pending; required when the trip is InProgress
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               pickUpLatitude:
 *                 type: number
 *                 nullable: true
 *               pickUpLongitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLatitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLongitude:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Students registered
 *       400:
 *         description: Validation error or HomeToSchool trip
 *       409:
 *         description: One or more students already registered for this trip
 */
/**
 * @openapi
 * /api/v1/student-transportation-registers:
 *   post:
 *     summary: Record a student transportation register entry
 *     description: |
 *       nearestBustopId comes from the student's latest active transport subscription;
 *       direction comes from the vehicle trip.
 *       HomeToSchool requires the trip to be InProgress.
 *       SchoolToHome allows Pending or InProgress.
 *       Completed or Cancelled trips cannot accept registrations.
 *       Status is derived automatically: Boarding (trip not started), OnTransit (trip InProgress), DroppedOff (endTime set).
 *     tags: [StudentTransportationRegisters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, vehicleTripId]
 *             properties:
 *               studentId:
 *                 type: string
 *               vehicleTripId:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional for SchoolToHome while Pending; required when the trip is InProgress
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               pickUpLatitude:
 *                 type: number
 *                 nullable: true
 *               pickUpLongitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLatitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLongitude:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Register created
 *       409:
 *         description: Student is already registered for this vehicle trip
 *   get:
 *     summary: List student transportation registers
 *     tags: [StudentTransportationRegisters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: nearestBustopId
 *         schema:
 *           type: string
 *       - in: query
 *         name: vehicleTripId
 *         schema:
 *           type: string
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [HomeToSchool, SchoolToHome]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Boarding, OnTransit, DroppedOff]
 *       - in: query
 *         name: fromDate
 *         description: Inclusive lower bound matched against startTime or createdAt
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         description: Inclusive upper bound matched against startTime or createdAt
 *         schema:
 *           type: string
 *           format: date-time
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
 *         description: Registers list
 */
/**
 * @openapi
 * /api/v1/student-transportation-registers/mine/parent:
 *   get:
 *     summary: List registered trips for the authenticated parent's children
 *     description: |
 *       Uses the parent user's email to find students whose guardianEmail matches.
 *       Results are ordered by vehicle trip status: Pending, InProgress, Completed,
 *       then Cancelled; within each status by createdAt descending.
 *       The date range filters by register createdAt and defaults to seven days ago
 *       through one day ahead.
 *     tags: [StudentTransportationRegisters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         description: Inclusive createdAt lower bound; defaults to seven days ago
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         description: Inclusive createdAt upper bound; defaults to one day ahead
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Children's transportation registers
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated user is not a parent
 */
/**
 * @openapi
 * /api/v1/student-transportation-registers/{id}:
 *   get:
 *     summary: Get a student transportation register by ID
 *     tags: [StudentTransportationRegisters]
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
 *         description: Student transportation register
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a student transportation register
 *     tags: [StudentTransportationRegisters]
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
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: When set, status becomes DroppedOff
 *               direction:
 *                 type: string
 *                 enum: [HomeToSchool, SchoolToHome]
 *               pickUpLatitude:
 *                 type: number
 *                 nullable: true
 *               pickUpLongitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLatitude:
 *                 type: number
 *                 nullable: true
 *               dropOffLongitude:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Register updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Delete a student transportation register
 *     tags: [StudentTransportationRegisters]
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
 *         description: Register deleted
 *       404:
 *         description: Not found
 */
export const studentTransportationRegisterController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        studentId,
        vehicleTripId,
        startTime,
        endTime,
        pickUpLatitude,
        pickUpLongitude,
        dropOffLatitude,
        dropOffLongitude,
      } = req.body ?? {};
      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!vehicleTripId || typeof vehicleTripId !== "string" || !vehicleTripId.trim()) {
        return res.status(400).json({ success: false, message: "vehicleTripId is required" });
      }

      const created = await studentTransportationRegisterService.create({
        studentId: studentId.trim(),
        vehicleTripId: vehicleTripId.trim(),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(pickUpLatitude !== undefined ? { pickUpLatitude } : {}),
        ...(pickUpLongitude !== undefined ? { pickUpLongitude } : {}),
        ...(dropOffLatitude !== undefined ? { dropOffLatitude } : {}),
        ...(dropOffLongitude !== undefined ? { dropOffLongitude } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Student transportation register created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create student transportation register");
    }
  },

  createMany: async (req: Request, res: Response) => {
    try {
      const {
        vehicleTripId,
        studentIds,
        startTime,
        endTime,
        pickUpLatitude,
        pickUpLongitude,
        dropOffLatitude,
        dropOffLongitude,
      } = req.body ?? {};
      if (!vehicleTripId || typeof vehicleTripId !== "string" || !vehicleTripId.trim()) {
        return res.status(400).json({ success: false, message: "vehicleTripId is required" });
      }
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "studentIds must be a non-empty array" });
      }

      const result = await studentTransportationRegisterService.createMany({
        vehicleTripId: vehicleTripId.trim(),
        studentIds,
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(pickUpLatitude !== undefined ? { pickUpLatitude } : {}),
        ...(pickUpLongitude !== undefined ? { pickUpLongitude } : {}),
        ...(dropOffLatitude !== undefined ? { dropOffLatitude } : {}),
        ...(dropOffLongitude !== undefined ? { dropOffLongitude } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Student transportation registers created successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(
        res,
        error,
        "Failed to bulk create student transportation registers"
      );
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const direction = parseDirection(queryString(req.query, "direction"));
      if (direction === "invalid") {
        return res.status(400).json({
          success: false,
          message: "direction must be one of HomeToSchool, SchoolToHome",
        });
      }

      const status = parseRegisterStatus(queryString(req.query, "status"));
      if (status === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Boarding, OnTransit, DroppedOff",
        });
      }

      const result = await studentTransportationRegisterService.list({
        studentId: queryString(req.query, "studentId"),
        nearestBustopId: queryString(req.query, "nearestBustopId"),
        vehicleTripId: queryString(req.query, "vehicleTripId"),
        ...(direction !== undefined ? { direction } : {}),
        ...(status !== undefined ? { status } : {}),
        fromDate: queryString(req.query, "fromDate"),
        toDate: queryString(req.query, "toDate"),
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Student transportation registers retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(
        res,
        error,
        "Failed to retrieve student transportation registers"
      );
    }
  },

  listMine: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const result = await studentTransportationRegisterService.listForAuthenticatedParent(userId, {
        fromDate: queryString(req.query, "fromDate"),
        toDate: queryString(req.query, "toDate"),
      });

      return res.json({
        success: true,
        message: "Children transportation registers retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(
        res,
        error,
        "Failed to retrieve children transportation registers"
      );
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await studentTransportationRegisterService.getById(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: "Student transportation register not found" });
      }

      return res.json({
        success: true,
        message: "Student transportation register retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(
        res,
        error,
        "Failed to retrieve student transportation register"
      );
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        endTime,
        direction,
        pickUpLatitude,
        pickUpLongitude,
        dropOffLatitude,
        dropOffLongitude,
      } = req.body ?? {};
      if (
        endTime === undefined &&
        direction === undefined &&
        pickUpLatitude === undefined &&
        pickUpLongitude === undefined &&
        dropOffLatitude === undefined &&
        dropOffLongitude === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one of endTime, direction, pickUpLatitude, pickUpLongitude, dropOffLatitude, or dropOffLongitude must be provided",
        });
      }

      const parsedDirection = parseDirection(direction);
      if (parsedDirection === "invalid") {
        return res.status(400).json({
          success: false,
          message: "direction must be one of HomeToSchool, SchoolToHome",
        });
      }

      const updated = await studentTransportationRegisterService.update(id, {
        ...(endTime !== undefined ? { endTime } : {}),
        ...(parsedDirection !== undefined ? { direction: parsedDirection } : {}),
        ...(pickUpLatitude !== undefined ? { pickUpLatitude } : {}),
        ...(pickUpLongitude !== undefined ? { pickUpLongitude } : {}),
        ...(dropOffLatitude !== undefined ? { dropOffLatitude } : {}),
        ...(dropOffLongitude !== undefined ? { dropOffLongitude } : {}),
      });

      return res.json({
        success: true,
        message: "Student transportation register updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update student transportation register");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await studentTransportationRegisterService.delete(id);

      return res.json({
        success: true,
        message: "Student transportation register deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete student transportation register");
    }
  },
};
