import { Request, Response } from "express";
import { routeBustopService } from "../services/routeBustopService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseIntOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/route-bustops:
 *   post:
 *     summary: Assign a bustop to a route
 *     tags: [RouteBustops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [routeId, bustopId]
 *             properties:
 *               routeId:
 *                 type: string
 *               bustopId:
 *                 type: string
 *               stopOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Route bustop assigned
 *   get:
 *     summary: List route-bustop assignments
 *     tags: [RouteBustops]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: bustopId
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
 *         description: Route bustops list
 */
/**
 * @openapi
 * /api/v1/route-bustops/bulk:
 *   post:
 *     summary: Assign multiple bustops to a route
 *     tags: [RouteBustops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [routeId, bustops]
 *             properties:
 *               routeId:
 *                 type: string
 *               bustops:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [bustopId]
 *                   properties:
 *                     bustopId:
 *                       type: string
 *                     stopOrder:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Route bustops assigned
 */
/**
 * @openapi
 * /api/v1/route-bustops/{id}:
 *   get:
 *     summary: Get a route-bustop assignment by ID
 *     tags: [RouteBustops]
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
 *         description: Route bustop assignment
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a route-bustop assignment
 *     tags: [RouteBustops]
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
 *             required: [stopOrder]
 *             properties:
 *               stopOrder:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Route bustop updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Remove a route-bustop assignment
 *     tags: [RouteBustops]
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
 *         description: Route bustop assignment removed
 *       404:
 *         description: Not found
 */
export const routeBustopController = {
  create: async (req: Request, res: Response) => {
    try {
      const { routeId, bustopId, stopOrder } = req.body ?? {};
      if (!routeId || typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({ success: false, message: "routeId is required" });
      }
      if (!bustopId || typeof bustopId !== "string" || !bustopId.trim()) {
        return res.status(400).json({ success: false, message: "bustopId is required" });
      }

      const created = await routeBustopService.create({
        routeId: routeId.trim(),
        bustopId: bustopId.trim(),
        ...(stopOrder !== undefined ? { stopOrder } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Route bustop assigned successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign route bustop");
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const { routeId, bustops } = req.body ?? {};
      if (!routeId || typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({ success: false, message: "routeId is required" });
      }
      if (!Array.isArray(bustops) || bustops.length === 0) {
        return res.status(400).json({ success: false, message: "bustops must be a non-empty array" });
      }

      const result = await routeBustopService.createMany({
        routeId: routeId.trim(),
        bustops,
      });

      return res.status(201).json({
        success: true,
        message: "Route bustops assigned successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to assign route bustops");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await routeBustopService.list({
        routeId: queryString(req.query, "routeId"),
        bustopId: queryString(req.query, "bustopId"),
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Route bustops retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve route bustops");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await routeBustopService.getById(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: "Route bustop assignment not found" });
      }

      return res.json({
        success: true,
        message: "Route bustop retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve route bustop");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { stopOrder } = req.body ?? {};
      if (stopOrder === undefined) {
        return res.status(400).json({ success: false, message: "stopOrder is required" });
      }

      const updated = await routeBustopService.update(id, { stopOrder });

      return res.json({
        success: true,
        message: "Route bustop updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update route bustop");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await routeBustopService.delete(id);

      return res.json({
        success: true,
        message: "Route bustop assignment removed successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to remove route bustop assignment");
    }
  },
};
