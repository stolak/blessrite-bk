import { Request, Response } from "express";
import { subClassService } from "../services/subClassService";
import { Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/sub-classes:
 *   post:
 *     summary: Create a sub class
 *     tags: [SubClasses]
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
 *                 example: "A"
 *               classId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional school class id. Empty string \"\" is treated as null.
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: SubClass created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invalid classId
 *       409:
 *         description: Duplicate name for the same class
 *       500:
 *         description: Server error
 *   get:
 *     summary: List sub classes
 *     tags: [SubClasses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches name)
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional filter by school class id
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
 *         description: SubClasses list
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const subClassController = {
  createSubClass: async (req: Request, res: Response) => {
    try {
      const { name, classId, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "SubClass name is required" });
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

      let normalizedClassId: string | null | undefined = undefined;
      if (classId !== undefined && classId !== null) {
        if (typeof classId !== "string") {
          return res.status(400).json({ success: false, message: "classId must be a string or null" });
        }
        normalizedClassId = classId.trim() === "" ? null : classId.trim();
      } else if (classId === null) {
        normalizedClassId = null;
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await subClassService.createSubClass({
        name: name.trim(),
        ...(normalizedClassId !== undefined ? { classId: normalizedClassId } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({ success: true, message: "SubClass created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create sub class";
      const code =
        message === "Invalid classId" ? 404 : message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listSubClasses: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
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

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await subClassService.listSubClasses({
        q,
        ...(classId !== undefined && classId.trim() !== "" ? { classId: classId.trim() } : {}),
        status,
        page,
        limit,
      });

      return res.json({ success: true, message: "SubClasses retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sub classes",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/sub-classes/{id}:
   *   get:
   *     summary: Get a sub class by ID
   *     tags: [SubClasses]
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
   *         description: SubClass details
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: SubClass not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a sub class
   *     tags: [SubClasses]
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
   *               classId:
   *                 type: string
   *                 nullable: true
   *                 description: Set to null to clear.
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: SubClass updated
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: SubClass/class not found
   *       409:
   *         description: Duplicate name for the same class
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a sub class
   *     tags: [SubClasses]
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
   *         description: SubClass deleted
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: SubClass not found
   *       500:
   *         description: Server error
   */
  getSubClassById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const found = await subClassService.getSubClassById(id);
      if (!found) return res.status(404).json({ success: false, message: "SubClass not found" });

      return res.json({ success: true, message: "SubClass retrieved successfully", data: found });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sub class",
        error: error?.message,
      });
    }
  },

  updateSubClass: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { name, classId, status } = req.body ?? {};

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

      let normalizedClassId: string | null | undefined = undefined;
      if (classId !== undefined) {
        if (classId !== null && typeof classId !== "string") {
          return res.status(400).json({ success: false, message: "classId must be a string or null" });
        }
        normalizedClassId =
          classId === null || classId === "" ? null : typeof classId === "string" ? classId.trim() || null : null;
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await subClassService.updateSubClass(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(normalizedClassId !== undefined ? { classId: normalizedClassId } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "SubClass updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update sub class";
      const statusCode =
        message === "Invalid classId"
          ? 404
          : message.includes("Record to update not found")
            ? 404
            : message.includes("already exists")
              ? 409
              : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },

  deleteSubClass: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await subClassService.deleteSubClass(id);
      return res.json({ success: true, message: "SubClass deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete sub class";
      const statusCode = message.includes("Record to delete does not exist")
        ? 404
        : message.includes("Cannot delete")
          ? 409
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  },
};

