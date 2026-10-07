import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { departmentService } from "../services/departmentService";
import { routeParam } from "../utils/request";

function parseStatusQuery(raw: unknown): Status | "All" | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  if (raw === "All") {
    return "All";
  }
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

function parseBodyStatus(raw: unknown): Status | undefined {
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

/**
 * @openapi
 * /api/v1/departments:
 *   post:
 *     summary: Create a department
 *     tags: [Departments]
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
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Defaults to Active
 *     responses:
 *       201:
 *         description: Department created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate department name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List departments
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by name (substring)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All for every status.
 *     responses:
 *       200:
 *         description: Departments list (all matching rows, no pagination)
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const departmentController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await departmentService.create({
        name: name.trim(),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Department created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create department";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (message.includes("name is required")) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);

      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const result = await departmentService.list({ q, status });

      return res.json({
        success: true,
        message: "Departments retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve departments",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/departments/{id}:
   *   get:
   *     summary: Get a department by ID
   *     tags: [Departments]
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
   *         description: Department details
   *       400:
   *         description: Invalid id
   *       404:
   *         description: Department not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a department
   *     tags: [Departments]
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
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Department updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Department not found
   *       409:
   *         description: Duplicate department name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a department
   *     tags: [Departments]
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
   *         description: Department deleted
   *       404:
   *         description: Department not found
   *       409:
   *         description: Referenced by other records
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const row = await departmentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Department not found" });
      }

      return res.json({
        success: true,
        message: "Department retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve department",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const { name, status } = req.body ?? {};
      const hasName = name !== undefined;
      const hasStatus = status !== undefined;

      if (!hasName && !hasStatus) {
        return res.status(400).json({
          success: false,
          message: "At least one of name or status must be provided",
        });
      }

      if (hasName && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({
          success: false,
          message: "name must be a non-empty string when provided",
        });
      }

      const parsedStatus = parseBodyStatus(status);
      if (hasStatus && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await departmentService.update(id, {
        ...(hasName ? { name: (name as string).trim() } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Department updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update department";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (message === "Department not found") {
        return res.status(404).json({ success: false, message });
      }
      if (message.includes("name cannot be empty")) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const deleted = await departmentService.delete(id);

      return res.json({
        success: true,
        message: "Department deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete department";
      if (message === "Department not found") {
        return res.status(404).json({ success: false, message });
      }
      if (message.includes("Cannot delete")) {
        return res.status(409).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },
};
