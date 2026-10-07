import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { bustopService } from "../services/bustopService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
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

/**
 * @openapi
 * /api/v1/bustops:
 *   post:
 *     summary: Create a bustop
 *     tags: [Bustops]
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
 *               latitude:
 *                 type: number
 *                 nullable: true
 *               longitude:
 *                 type: number
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Bustop created
 *   get:
 *     summary: List bustops
 *     tags: [Bustops]
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
 *         description: Bustops list
 */
/**
 * @openapi
 * /api/v1/bustops/{id}:
 *   get:
 *     summary: Get a bustop by ID
 *     tags: [Bustops]
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
 *         description: Bustop details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a bustop
 *     tags: [Bustops]
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
 *               latitude:
 *                 type: number
 *                 nullable: true
 *               longitude:
 *                 type: number
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       200:
 *         description: Bustop updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate bustop name
 *   delete:
 *     summary: Delete a bustop
 *     tags: [Bustops]
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
 *         description: Bustop deleted
 *       400:
 *         description: Cannot delete because it is referenced
 *       404:
 *         description: Not found
 */
export const bustopController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, description, latitude, longitude, status } = req.body ?? {};
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

      const created = await bustopService.create({
        name: name.trim(),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Bustop created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create bustop");
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

      const result = await bustopService.list({
        q: queryString(req.query, "q"),
        status,
        page: parseIntOrUndefined(req.query.page),
        limit: parseIntOrUndefined(req.query.limit),
      });

      return res.json({
        success: true,
        message: "Bustops retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve bustops");
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await bustopService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Bustop not found" });
      }

      return res.json({
        success: true,
        message: "Bustop retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve bustop");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { name, description, latitude, longitude, status } = req.body ?? {};
      if (
        name === undefined &&
        description === undefined &&
        latitude === undefined &&
        longitude === undefined &&
        status === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided",
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

      const updated = await bustopService.update(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Bustop updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update bustop");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await bustopService.delete(id);

      return res.json({
        success: true,
        message: "Bustop deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete bustop");
    }
  },
};
