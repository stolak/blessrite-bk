import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { routeService } from "../services/routeService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal } from "../utils/assessmentHttp";
import { parseIntOrUndefined } from "../utils/request";

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

function parseOptionalCostField(
  raw: unknown,
  fieldName: string
): { ok: true; value?: string | number | null } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true };
  if (raw === null) return { ok: true, value: null };
  const parsed = parseBodyDecimal(raw, fieldName);
  if (parsed === "missing" || parsed === "invalid") {
    return { ok: false, message: `${fieldName} must be a number or null` };
  }
  return { ok: true, value: parsed };
}

/**
 * @openapi
 * /api/v1/routes:
 *   post:
 *     summary: Create a transport route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               homeToSchoolCost:
 *                 type: number
 *                 nullable: true
 *               schoolToHomeCost:
 *                 type: number
 *                 nullable: true
 *               roundTripCost:
 *                 type: number
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Route created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate route name
 *   get:
 *     summary: List transport routes
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
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
 *         description: Routes list
 */
/**
 * @openapi
 * /api/v1/routes/{id}:
 *   get:
 *     summary: Get a transport route by ID
 *     tags: [Routes]
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
 *         description: Route details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a transport route
 *     tags: [Routes]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               homeToSchoolCost:
 *                 type: number
 *                 nullable: true
 *               schoolToHomeCost:
 *                 type: number
 *                 nullable: true
 *               roundTripCost:
 *                 type: number
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       200:
 *         description: Route updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate route name
 *   delete:
 *     summary: Delete a transport route
 *     tags: [Routes]
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
 *         description: Route deleted
 *       400:
 *         description: Cannot delete because it is referenced
 *       404:
 *         description: Not found
 */
export const routeController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        homeToSchoolCost,
        schoolToHomeCost,
        roundTripCost,
        status,
      } = req.body ?? {};
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const parsedStatus = parseStatus(status);
      if (parsedStatus === "invalid" || parsedStatus === "All") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived",
        });
      }

      const homeCost = parseOptionalCostField(homeToSchoolCost, "homeToSchoolCost");
      if (!homeCost.ok) return res.status(400).json({ success: false, message: homeCost.message });
      const schoolCost = parseOptionalCostField(schoolToHomeCost, "schoolToHomeCost");
      if (!schoolCost.ok) return res.status(400).json({ success: false, message: schoolCost.message });
      const roundCost = parseOptionalCostField(roundTripCost, "roundTripCost");
      if (!roundCost.ok) return res.status(400).json({ success: false, message: roundCost.message });

      const created = await routeService.create({
        name: name.trim(),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(homeCost.value !== undefined ? { homeToSchoolCost: homeCost.value } : {}),
        ...(schoolCost.value !== undefined ? { schoolToHomeCost: schoolCost.value } : {}),
        ...(roundCost.value !== undefined ? { roundTripCost: roundCost.value } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Route created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create route");
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

      const result = await routeService.list({
        q: queryString(req.query, "q"),
        status,
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Routes retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve routes");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await routeService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Route not found" });
      }

      return res.json({
        success: true,
        message: "Route retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve route");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        name,
        description,
        homeToSchoolCost,
        schoolToHomeCost,
        roundTripCost,
        status,
      } = req.body ?? {};
      if (
        name === undefined &&
        description === undefined &&
        homeToSchoolCost === undefined &&
        schoolToHomeCost === undefined &&
        roundTripCost === undefined &&
        status === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one of name, description, homeToSchoolCost, schoolToHomeCost, roundTripCost, or status must be provided",
        });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }

      const parsedStatus = parseStatus(status);
      if (parsedStatus === "invalid" || parsedStatus === "All") {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Archived",
        });
      }

      const homeCost = parseOptionalCostField(homeToSchoolCost, "homeToSchoolCost");
      if (!homeCost.ok) return res.status(400).json({ success: false, message: homeCost.message });
      const schoolCost = parseOptionalCostField(schoolToHomeCost, "schoolToHomeCost");
      if (!schoolCost.ok) return res.status(400).json({ success: false, message: schoolCost.message });
      const roundCost = parseOptionalCostField(roundTripCost, "roundTripCost");
      if (!roundCost.ok) return res.status(400).json({ success: false, message: roundCost.message });

      const updated = await routeService.update(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(homeCost.value !== undefined ? { homeToSchoolCost: homeCost.value } : {}),
        ...(schoolCost.value !== undefined ? { schoolToHomeCost: schoolCost.value } : {}),
        ...(roundCost.value !== undefined ? { roundTripCost: roundCost.value } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Route updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update route");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await routeService.delete(id);

      return res.json({
        success: true,
        message: "Route deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete route");
    }
  },
};
