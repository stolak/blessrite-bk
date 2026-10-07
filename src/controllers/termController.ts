import { Request, Response } from "express";
import { termService } from "../services/termService";
import { Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/terms:
 *   post:
 *     summary: Create a term
 *     tags: [Terms]
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
 *                 example: "First Term"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: Term created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List terms
 *     tags: [Terms]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches name)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All to include all statuses.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Terms list
 *       500:
 *         description: Server error
 */
export const termController = {
  createTerm: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "Term name is required" });
      }

      if (
        status !== undefined &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await termService.createTerm({
        name: name.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({ success: true, message: "Term created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create term";
      const code = message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listTerms: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : statusRaw === "Active"
              ? Status.Active
              : statusRaw === "Inactive"
                ? Status.Inactive
                : statusRaw === "Archived"
                  ? Status.Archived
                  : undefined;

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await termService.listTerms({ q, status, page, limit });
      return res.json({ success: true, message: "Terms retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve terms",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/terms/{id}:
   *   get:
   *     summary: Get a term by ID
   *     tags: [Terms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Term details
   *       404:
   *         description: Term not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a term
   *     tags: [Terms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Term updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Term not found
   *       409:
   *         description: Duplicate name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a term
   *     tags: [Terms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Term deleted
   *       404:
   *         description: Term not found
   *       500:
   *         description: Server error
   */
  getTermById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const found = await termService.getTermById(id);
      if (!found) return res.status(404).json({ success: false, message: "Term not found" });

      return res.json({ success: true, message: "Term retrieved successfully", data: found });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve term",
        error: error?.message,
      });
    }
  },

  updateTerm: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { name, status } = req.body ?? {};

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      if (
        status !== undefined &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await termService.updateTerm(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Term updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update term";
      const statusCode =
        message.includes("Record to update not found") ? 404 : message.includes("already exists") ? 409 : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  deleteTerm: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await termService.deleteTerm(id);
      return res.json({ success: true, message: "Term deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete term";
      const statusCode = message.includes("Record to delete does not exist")
        ? 404
        : message.includes("Cannot delete")
          ? 409
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },
};

