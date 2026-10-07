import { Request, Response } from "express";
import { schoolClassService } from "../services/schoolClassService";
import { Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/school-classes:
 *   post:
 *     summary: Create a school class
 *     tags: [SchoolClasses]
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
 *                 example: "JSS 1A"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: School class created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Duplicate name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List school classes
 *     tags: [SchoolClasses]
 *     security:
 *       - bearerAuth: []
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
 *         description: School classes list
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const schoolClassController = {
  createSchoolClass: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "School class name is required" });
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

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const schoolClass = await schoolClassService.createSchoolClass({
        name: name.trim(),
        createdById,
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "School class created successfully",
        data: schoolClass,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create school class";
      const status = message.includes("already exists") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  listSchoolClasses: async (req: Request, res: Response) => {
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
        return res
          .status(400)
          .json({ success: false, message: "status must be Active, Inactive, Archived, or All" });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await schoolClassService.listSchoolClasses({ q, status, page, limit });

      return res.json({
        success: true,
        message: "School classes retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve school classes",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/school-classes/{id}:
   *   get:
   *     summary: Get a school class by ID
   *     tags: [SchoolClasses]
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
   *         description: School class details
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: School class not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a school class
   *     tags: [SchoolClasses]
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
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: School class updated
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: School class not found
   *       409:
   *         description: Duplicate name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a school class
   *     tags: [SchoolClasses]
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
   *         description: School class deleted
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: School class not found
   *       500:
   *         description: Server error
   */
  getSchoolClassById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const schoolClass = await schoolClassService.getSchoolClassById(id);
      if (!schoolClass) return res.status(404).json({ success: false, message: "School class not found" });

      return res.json({ success: true, message: "School class retrieved successfully", data: schoolClass });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve school class",
        error: error?.message,
      });
    }
  },

  updateSchoolClass: async (req: Request, res: Response) => {
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

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await schoolClassService.updateSchoolClass(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "School class updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update school class";
      const statusCode = message.includes("Record to update not found") ? 404 : message.includes("already exists") ? 409 : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  deleteSchoolClass: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await schoolClassService.deleteSchoolClass(id);
      return res.json({ success: true, message: "School class deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete school class";
      const statusCode = message.includes("Record to delete does not exist")
        ? 404
        : message.includes("Cannot delete")
          ? 409
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },
};

