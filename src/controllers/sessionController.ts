import { Request, Response } from "express";
import { sessionService } from "../services/sessionService";
import { Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/sessions:
 *   post:
 *     summary: Create a session
 *     tags: [Sessions]
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
 *                 example: "2025/2026"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: Session created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List sessions
 *     tags: [Sessions]
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
 *         description: Sessions list
 *       500:
 *         description: Server error
 */
export const sessionController = {
  createSession: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "Session name is required" });
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

      const created = await sessionService.createSession({
        name: name.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Session created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create session";
      const code = message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listSessions: async (req: Request, res: Response) => {
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

      const result = await sessionService.listSessions({ q, status, page, limit });
      return res.json({ success: true, message: "Sessions retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sessions",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/sessions/{id}:
   *   get:
   *     summary: Get a session by ID
   *     tags: [Sessions]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session details
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a session
   *     tags: [Sessions]
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
   *         description: Session updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Session not found
   *       409:
   *         description: Duplicate name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a session
   *     tags: [Sessions]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session deleted
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  getSessionById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const found = await sessionService.getSessionById(id);
      if (!found) return res.status(404).json({ success: false, message: "Session not found" });

      return res.json({ success: true, message: "Session retrieved successfully", data: found });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve session",
        error: error?.message,
      });
    }
  },

  updateSession: async (req: Request, res: Response) => {
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

      const updated = await sessionService.updateSession(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Session updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update session";
      const statusCode =
        message.includes("Record to update not found") ? 404 : message.includes("already exists") ? 409 : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  deleteSession: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await sessionService.deleteSession(id);
      return res.json({ success: true, message: "Session deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete session";
      const statusCode = message.includes("Record to delete does not exist")
        ? 404
        : message.includes("Cannot delete")
          ? 409
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },
};

