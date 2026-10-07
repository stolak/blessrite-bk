import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { projectService } from "../services/projectService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/projects:
 *   post:
 *     summary: Create a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     description: Inventory transactions are linked to a project via their projectId, not on create.
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
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Project created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     description: Each row includes _count.inventoryTransactions. Transactions attach via InventoryTransaction.projectId.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search name or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All for every status.
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
 *         description: Projects list
 *       500:
 *         description: Server error
 */
export const projectController = {
  createProject: async (req: Request, res: Response) => {
    try {
      const { name, description, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
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

      const createdById = (req as { user?: { id: string } }).user?.id ?? null;

      const created = await projectService.createProject({
        name: name.trim(),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
        createdById,
      });

      return res.status(201).json({ success: true, message: "Project created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create project";
      return res.status(500).json({ success: false, message });
    }
  },

  listProjects: async (req: Request, res: Response) => {
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

      const result = await projectService.listProjects({ q, status, page, limit });
      return res.json({ success: true, message: "Projects retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve projects",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/projects/{id}:
   *   get:
   *     summary: Get a project by ID
   *     tags: [Projects]
   *     security:
   *       - bearerAuth: []
   *     description: Includes inventoryTransactions where projectId matches (ordered by transactionDate desc).
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Project details
   *       404:
   *         description: Project not found
   *   put:
   *     summary: Update a project
   *     tags: [Projects]
   *     security:
   *       - bearerAuth: []
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
   *               description:
   *                 type: string
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Project updated
   *       404:
   *         description: Project not found
   *   delete:
   *     summary: Delete a project
   *     tags: [Projects]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Project deleted
   *       404:
   *         description: Project not found
   *       409:
   *         description: Referenced by inventory transactions
   */
  getProjectById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await projectService.getProjectById(id);
      if (!row) return res.status(404).json({ success: false, message: "Project not found" });
      return res.json({ success: true, message: "Project retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve project",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateProject: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { name, description, status } = req.body ?? {};

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string if provided" });
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

      const updated = await projectService.updateProject(id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Project updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update project";
      const code =
        message === "Project not found" ? 404 : message === "name cannot be empty" ? 400 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteProject: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await projectService.deleteProject(id);
      return res.json({ success: true, message: "Project deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete project";
      const code =
        message === "Project not found" ? 404 : message.includes("cannot be deleted") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
