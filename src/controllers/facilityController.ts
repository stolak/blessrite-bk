import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { facilityService } from "../services/facilityService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/facilities:
 *   post:
 *     summary: Create a facility
 *     tags: [Facilities]
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
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Facility created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List facilities
 *     tags: [Facilities]
 *     security:
 *       - bearerAuth: []
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
 *         description: Facilities list
 *       500:
 *         description: Server error
 */
export const facilityController = {
  createFacility: async (req: Request, res: Response) => {
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

      const created = await facilityService.createFacility({
        name: name.trim(),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
        createdById,
      });

      return res.status(201).json({ success: true, message: "Facility created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create facility";
      return res.status(500).json({ success: false, message });
    }
  },

  listFacilities: async (req: Request, res: Response) => {
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

      const result = await facilityService.listFacilities({ q, status, page, limit });
      return res.json({ success: true, message: "Facilities retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve facilities",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/facilities/{id}:
   *   get:
   *     summary: Get a facility by ID
   *     tags: [Facilities]
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
   *         description: Facility details
   *       404:
   *         description: Facility not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a facility
   *     tags: [Facilities]
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
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Facility updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Facility not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a facility
   *     tags: [Facilities]
   *     security:
   *       - bearerAuth: []
   *     description: Fails with 409 when InventoryTransaction rows reference this facility.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Facility deleted
   *       404:
   *         description: Facility not found
   *       409:
   *         description: Referenced by inventory transactions
   *       500:
   *         description: Server error
   */
  getFacilityById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await facilityService.getFacilityById(id);
      if (!row) return res.status(404).json({ success: false, message: "Facility not found" });

      return res.json({ success: true, message: "Facility retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve facility",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateFacility: async (req: Request, res: Response) => {
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

      const updated = await facilityService.updateFacility(id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Facility updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update facility";
      const code =
        message === "Facility not found" ? 404 : message === "name cannot be empty" ? 400 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteFacility: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await facilityService.deleteFacility(id);
      return res.json({ success: true, message: "Facility deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete facility";
      const code =
        message === "Facility not found" ? 404 : message.includes("Cannot delete") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
