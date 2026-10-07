import { Request, Response } from "express";
import { Direction, VehicleTripStatus } from "@prisma/client";
import { vehicleTripService } from "../services/vehicleTripService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { parseIntOrUndefined, routeParam } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseVehicleTripStatus(raw: unknown): VehicleTripStatus | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (
    raw === VehicleTripStatus.Pending ||
    raw === VehicleTripStatus.InProgress ||
    raw === VehicleTripStatus.Completed ||
    raw === VehicleTripStatus.Cancelled
  ) {
    return raw;
  }
  return "invalid";
}

function parseTripDirection(raw: unknown): Direction | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === Direction.HomeToSchool || raw === Direction.SchoolToHome) return raw;
  return "invalid";
}

/**
 * @openapi
 * /api/v1/vehicle-trips:
 *   post:
 *     summary: Start or record a vehicle trip
 *     description: |
 *       driverId is optional. If omitted, the authenticated user must be staff;
 *       their staff id is used as driverId. Non-staff users are denied.
 *     tags: [VehicleTrips]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleId, routeIds]
 *             properties:
 *               label:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *               vehicleId:
 *                 type: string
 *               routeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *               driverId:
 *                 type: string
 *                 description: Optional; defaults to authenticated staff id when omitted
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               latitude:
 *                 type: number
 *                 nullable: true
 *               longitude:
 *                 type: number
 *                 nullable: true
 *               tripDirection:
 *                 type: string
 *                 enum: [HomeToSchool, SchoolToHome]
 *               status:
 *                 type: string
 *                 enum: [Pending, InProgress, Completed, Cancelled]
 *     responses:
 *       201:
 *         description: Vehicle trip created
 *       409:
 *         description: Vehicle already has an active trip (Pending or InProgress)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated user is not staff (when driverId omitted)
 *   get:
 *     summary: List vehicle trips
 *     tags: [VehicleTrips]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: label
 *         description: Partial label match
 *         schema:
 *           type: string
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: string
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, InProgress, Completed, Cancelled]
 *       - in: query
 *         name: tripDirection
 *         schema:
 *           type: string
 *           enum: [HomeToSchool, SchoolToHome]
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
 *         description: Vehicle trips list
 */
/**
 * @openapi
 * /api/v1/vehicle-trips/mine:
 *   get:
 *     summary: List trips involving the authenticated staff member
 *     description: |
 *       Returns trips where the authenticated staff member is either the driver
 *       or assigned as support staff. Results are ordered Pending, InProgress,
 *       Completed, then Cancelled. The range filters by createdAt and defaults
 *       to seven days ago through one day ahead.
 *     tags: [VehicleTrips]
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
 *         description: Staff vehicle trips retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated user is not a staff user
 *       404:
 *         description: No staff profile is linked to the authenticated user
 */
/**
 * @openapi
 * /api/v1/vehicle-trips/{id}/eligible-students:
 *   get:
 *     summary: List students whose nearest bustop is on the trip routes
 *     description: |
 *       Returns active student transports whose subscribed nearest bustop is on one of the
 *       selected trip routes, and whose subscription type allows the trip direction.
 *       Also indicates whether the student is already registered for this trip.
 *     tags: [VehicleTrips]
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
 *         description: Eligible students for the trip
 *       404:
 *         description: Vehicle trip not found
 */
/**
 * @openapi
 * /api/v1/vehicle-trips/{id}/support-staff:
 *   post:
 *     summary: Assign support staff to a vehicle trip
 *     tags: [VehicleTrips]
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
 *             required: [staffId]
 *             properties:
 *               staffId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Support staff assigned; returns the updated vehicle trip
 *       404:
 *         description: Vehicle trip or staff not found
 *       409:
 *         description: Staff is already assigned to the trip
 */
/**
 * @openapi
 * /api/v1/vehicle-trips/{id}/support-staff/{staffId}:
 *   delete:
 *     summary: Remove support staff from a vehicle trip
 *     tags: [VehicleTrips]
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
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Support staff removed; returns the updated vehicle trip
 *       404:
 *         description: Vehicle trip or support staff assignment not found
 */
/**
 * @openapi
 * /api/v1/vehicle-trips/{id}:
 *   get:
 *     summary: Get a vehicle trip by ID
 *     tags: [VehicleTrips]
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
 *         description: Vehicle trip details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a vehicle trip
 *     tags: [VehicleTrips]
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
 *               label:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Required when changing status to InProgress; may be updated while already InProgress
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: When set, status becomes Completed (or Cancelled if no students boarded)
 *               latitude:
 *                 type: number
 *                 nullable: true
 *               longitude:
 *                 type: number
 *                 nullable: true
 *               driverId:
 *                 type: string
 *               routeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *               tripDirection:
 *                 type: string
 *                 enum: [HomeToSchool, SchoolToHome]
 *               status:
 *                 type: string
 *                 enum: [Pending, InProgress, Completed, Cancelled]
 *                 description: Changing to InProgress requires startTime and syncs startTime/pickup coords onto linked student transportation registers
 *     responses:
 *       200:
 *         description: Vehicle trip updated
 *       400:
 *         description: Validation error (e.g. startTime required with InProgress)
 *       409:
 *         description: Vehicle already has an active trip (Pending or InProgress)
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Delete a vehicle trip
 *     tags: [VehicleTrips]
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
 *         description: Vehicle trip deleted
 *       400:
 *         description: Cannot delete because transportation registers exist
 *       404:
 *         description: Not found
 */
export const vehicleTripController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        label,
        vehicleId,
        routeIds,
        driverId,
        startTime,
        endTime,
        latitude,
        longitude,
        tripDirection,
        status,
      } = req.body ?? {};
      if (!vehicleId || typeof vehicleId !== "string" || !vehicleId.trim()) {
        return res.status(400).json({ success: false, message: "vehicleId is required" });
      }
      if (!Array.isArray(routeIds) || routeIds.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "routeIds must be a non-empty array" });
      }
      if (
        driverId !== undefined &&
        driverId !== null &&
        (typeof driverId !== "string" || !driverId.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "driverId must be a non-empty string when provided",
        });
      }

      const parsedStatus = parseVehicleTripStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Pending, InProgress, Completed, Cancelled",
        });
      }

      const parsedTripDirection = parseTripDirection(tripDirection);
      if (parsedTripDirection === "invalid") {
        return res.status(400).json({
          success: false,
          message: "tripDirection must be one of HomeToSchool, SchoolToHome",
        });
      }

      const authenticatedUserId = getAuthenticatedUserId(req);
      const providedDriverId =
        typeof driverId === "string" && driverId.trim() ? driverId.trim() : undefined;

      const created = await vehicleTripService.create({
        ...(label !== undefined ? { label } : {}),
        vehicleId: vehicleId.trim(),
        routeIds,
        ...(providedDriverId ? { driverId: providedDriverId } : {}),
        authenticatedUserId,
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(parsedTripDirection !== undefined ? { tripDirection: parsedTripDirection } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Vehicle trip created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create vehicle trip");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const status = parseVehicleTripStatus(queryString(req.query, "status"));
      if (status === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Pending, InProgress, Completed, Cancelled",
        });
      }

      const tripDirection = parseTripDirection(queryString(req.query, "tripDirection"));
      if (tripDirection === "invalid") {
        return res.status(400).json({
          success: false,
          message: "tripDirection must be one of HomeToSchool, SchoolToHome",
        });
      }

      const result = await vehicleTripService.list({
        label: queryString(req.query, "label"),
        vehicleId: queryString(req.query, "vehicleId"),
        routeId: queryString(req.query, "routeId"),
        driverId: queryString(req.query, "driverId"),
        ...(status !== undefined ? { status } : {}),
        ...(tripDirection !== undefined ? { tripDirection } : {}),
        fromDate: queryString(req.query, "fromDate"),
        toDate: queryString(req.query, "toDate"),
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Vehicle trips retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve vehicle trips");
    }
  },

  listMine: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const result = await vehicleTripService.listForAuthenticatedStaff(userId, {
        fromDate: queryString(req.query, "fromDate"),
        toDate: queryString(req.query, "toDate"),
      });
      return res.json({
        success: true,
        message: "My vehicle trips retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve my vehicle trips");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await vehicleTripService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Vehicle trip not found" });
      }

      return res.json({
        success: true,
        message: "Vehicle trip retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve vehicle trip");
    }
  },

  listEligibleStudents: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const result = await vehicleTripService.listEligibleStudents(id);

      return res.json({
        success: true,
        message: "Eligible students retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve eligible students");
    }
  },

  addSupportStaff: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { staffId } = req.body ?? {};
      if (typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }

      const updated = await vehicleTripService.addSupportStaff(id, staffId);
      return res.json({
        success: true,
        message: "Support staff assigned successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign support staff");
    }
  },

  removeSupportStaff: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const staffId = routeParam(req.params.staffId).trim();
      if (!staffId) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }

      const updated = await vehicleTripService.removeSupportStaff(id, staffId);
      return res.json({
        success: true,
        message: "Support staff removed successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove support staff");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        label,
        startTime,
        endTime,
        latitude,
        longitude,
        driverId,
        routeId,
        routeIds,
        tripDirection,
        status,
      } = req.body ?? {};
      if (
        label === undefined &&
        startTime === undefined &&
        endTime === undefined &&
        latitude === undefined &&
        longitude === undefined &&
        driverId === undefined &&
        routeId === undefined &&
        routeIds === undefined &&
        tripDirection === undefined &&
        status === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided",
        });
      }

      const parsedStatus = parseVehicleTripStatus(status);
      if (parsedStatus === "invalid") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Pending, InProgress, Completed, Cancelled",
        });
      }

      const parsedTripDirection = parseTripDirection(tripDirection);
      if (parsedTripDirection === "invalid") {
        return res.status(400).json({
          success: false,
          message: "tripDirection must be one of HomeToSchool, SchoolToHome",
        });
      }

      if (routeId !== undefined && routeIds !== undefined) {
        return res.status(400).json({
          success: false,
          message: "Provide routeIds only, not both routeId and routeIds",
        });
      }

      const updated = await vehicleTripService.update(id, {
        ...(label !== undefined ? { label } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(driverId !== undefined ? { driverId: String(driverId) } : {}),
        ...(routeIds !== undefined
          ? { routeIds: Array.isArray(routeIds) ? routeIds : [] }
          : routeId !== undefined
            ? { routeIds: [String(routeId)] }
            : {}),
        ...(parsedTripDirection !== undefined ? { tripDirection: parsedTripDirection } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Vehicle trip updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update vehicle trip");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await vehicleTripService.delete(id);

      return res.json({
        success: true,
        message: "Vehicle trip deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete vehicle trip");
    }
  },
};
