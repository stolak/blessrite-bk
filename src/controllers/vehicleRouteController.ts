import { Request, Response } from "express";
import { vehicleRouteService } from "../services/vehicleRouteService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseIntOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/vehicle-routes:
 *   post:
 *     summary: Assign a route to a vehicle
 *     tags: [VehicleRoutes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleId, routeId]
 *             properties:
 *               vehicleId:
 *                 type: string
 *               routeId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vehicle route assigned
 *       400:
 *         description: Validation error
 *       409:
 *         description: Already assigned
 *   get:
 *     summary: List vehicle-route assignments
 *     tags: [VehicleRoutes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: string
 *       - in: query
 *         name: routeId
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
 *         description: Vehicle routes list
 */
/**
 * @openapi
 * /api/v1/vehicle-routes/bulk:
 *   post:
 *     summary: Assign multiple routes to a vehicle
 *     tags: [VehicleRoutes]
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
 *               vehicleId:
 *                 type: string
 *               routeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Vehicle routes assigned
 */
/**
 * @openapi
 * /api/v1/vehicle-routes/{id}:
 *   get:
 *     summary: Get a vehicle-route assignment by ID
 *     tags: [VehicleRoutes]
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
 *         description: Vehicle route assignment
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Remove a vehicle-route assignment
 *     tags: [VehicleRoutes]
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
 *         description: Vehicle route assignment removed
 *       404:
 *         description: Not found
 */
export const vehicleRouteController = {
  create: async (req: Request, res: Response) => {
    try {
      const { vehicleId, routeId } = req.body ?? {};
      if (!vehicleId || typeof vehicleId !== "string" || !vehicleId.trim()) {
        return res.status(400).json({ success: false, message: "vehicleId is required" });
      }
      if (!routeId || typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({ success: false, message: "routeId is required" });
      }

      const created = await vehicleRouteService.create({
        vehicleId: vehicleId.trim(),
        routeId: routeId.trim(),
      });

      return res.status(201).json({
        success: true,
        message: "Vehicle route assigned successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign vehicle route");
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const { vehicleId, routeIds } = req.body ?? {};
      if (!vehicleId || typeof vehicleId !== "string" || !vehicleId.trim()) {
        return res.status(400).json({ success: false, message: "vehicleId is required" });
      }
      if (!Array.isArray(routeIds) || routeIds.length === 0) {
        return res.status(400).json({ success: false, message: "routeIds must be a non-empty array" });
      }

      const result = await vehicleRouteService.createMany({
        vehicleId: vehicleId.trim(),
        routeIds,
      });

      return res.status(201).json({
        success: true,
        message: "Vehicle routes assigned successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign vehicle routes");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await vehicleRouteService.list({
        vehicleId: queryString(req.query, "vehicleId"),
        routeId: queryString(req.query, "routeId"),
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Vehicle routes retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve vehicle routes");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await vehicleRouteService.getById(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: "Vehicle route assignment not found" });
      }

      return res.json({
        success: true,
        message: "Vehicle route retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve vehicle route");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await vehicleRouteService.delete(id);

      return res.json({
        success: true,
        message: "Vehicle route assignment removed successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove vehicle route assignment");
    }
  },
};
