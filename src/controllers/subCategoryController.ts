import { Request, Response } from "express";
import { subCategoryService } from "../services/subCategoryService";
import { Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/sub-categories:
 *   post:
 *     summary: Create a sub-category
 *     tags: [SubCategories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, categoryId]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Notebooks"
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: "Exercise books and notebooks"
 *               categoryId:
 *                 type: string
 *                 description: Parent category ID
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: Sub-category created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate sub-category name for the same category
 *       500:
 *         description: Server error
 *   get:
 *     summary: List sub-categories
 *     tags: [SubCategories]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches sub-category name)
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Optional filter by category ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, All]
 *         description: Defaults to Active only. Use All to include Active and Inactive.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Sub-categories list
 *       500:
 *         description: Server error
 */
export const subCategoryController = {
  createSubCategory: async (req: Request, res: Response) => {
    try {
      const { name, description, categoryId, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "SubCategory name is required",
        });
      }

      if (description !== undefined && description !== null && typeof description !== "string") {
        return res.status(400).json({
          success: false,
          message: "description must be a string or null",
        });
      }

      if (!categoryId || typeof categoryId !== "string" || !categoryId.trim()) {
        return res.status(400).json({
          success: false,
          message: "categoryId is required",
        });
      }

      if (status !== undefined && status !== Status.Active && status !== Status.Inactive) {
        return res.status(400).json({
          success: false,
          message: "status must be Active or Inactive",
        });
      }

      const subCategory = await subCategoryService.createSubCategory({
        name: name.trim(),
        description: description === undefined ? null : description,
        categoryId: categoryId.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "SubCategory created successfully",
        data: subCategory,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create sub-category";
      const status = message.includes("already exists") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  listSubCategories: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
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
                : undefined;

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or All",
        });
      }
      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await subCategoryService.listSubCategories({ q, categoryId, status, page, limit });

      return res.json({
        success: true,
        message: "SubCategories retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sub-categories",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/sub-categories/{id}:
   *   get:
   *     summary: Get a sub-category by ID
   *     tags: [SubCategories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Sub-category ID
   *     responses:
   *       200:
   *         description: Sub-category details
   *       404:
   *         description: Sub-category not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a sub-category
   *     tags: [SubCategories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Sub-category ID
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
   *               categoryId:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Sub-category updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Sub-category not found
   *       409:
   *         description: Duplicate sub-category name for the same category
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a sub-category
   *     tags: [SubCategories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Sub-category ID
   *     responses:
   *       200:
   *         description: Sub-category deleted
   *       404:
   *         description: Sub-category not found
   *       500:
   *         description: Server error
   */
  getSubCategoryById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "SubCategory id parameter is required",
        });
      }

      const subCategory = await subCategoryService.getSubCategoryById(id);

      if (!subCategory) {
        return res.status(404).json({
          success: false,
          message: "SubCategory not found",
        });
      }

      return res.json({
        success: true,
        message: "SubCategory retrieved successfully",
        data: subCategory,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sub-category",
        error: error?.message,
      });
    }
  },

  updateSubCategory: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const { name, description, categoryId, status } = req.body ?? {};

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "SubCategory id parameter is required",
        });
      }

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({
          success: false,
          message: "name must be a non-empty string",
        });
      }

      if (description !== undefined && description !== null && typeof description !== "string") {
        return res.status(400).json({
          success: false,
          message: "description must be a string or null",
        });
      }

      if (categoryId !== undefined && categoryId !== null && typeof categoryId !== "string") {
        return res.status(400).json({
          success: false,
          message: "categoryId must be a string or null",
        });
      }
      if (categoryId === null) {
        return res.status(400).json({
          success: false,
          message: "categoryId cannot be null",
        });
      }

      if (status !== undefined && status !== Status.Active && status !== Status.Inactive) {
        return res.status(400).json({
          success: false,
          message: "status must be Active or Inactive",
        });
      }

      const existing = await subCategoryService.getSubCategoryById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "SubCategory not found",
        });
      }

      const updated = await subCategoryService.updateSubCategory(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "SubCategory updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update sub-category";
      const status = message.includes("already exists") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  deleteSubCategory: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "SubCategory id parameter is required",
        });
      }

      const existing = await subCategoryService.getSubCategoryById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "SubCategory not found",
        });
      }

      const deleted = await subCategoryService.deleteSubCategory(id);

      return res.json({
        success: true,
        message: "SubCategory deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete sub-category";
      const status = message.includes("Cannot delete") ? 409 : 500;
      return res.status(status).json({
        success: false,
        message,
        error: message,
      });
    }
  },
};

