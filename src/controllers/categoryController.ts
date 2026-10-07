import { Request, Response } from "express";
import { categoryService } from "../services/categoryService";
import { InventoryCategoryType, Status } from "@prisma/client";
import { parseIntOrUndefined, routeParam } from "../utils/request";

function parseConsumableAccountIdInput(
  value: unknown
): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };

  const parsed =
    typeof value === "number" && Number.isInteger(value)
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return { ok: false, message: "consumableAccountId must be a positive integer, null, or omitted" };
  }

  return { ok: true, value: parsed };
}

function parseAssetAccountIdInput(
  value: unknown
): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };

  const parsed =
    typeof value === "number" && Number.isInteger(value)
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return { ok: false, message: "assetAccountId must be a positive integer, null, or omitted" };
  }

  return { ok: true, value: parsed };
}

function parseCategoryTypeInput(
  value: unknown
): { ok: true; value: InventoryCategoryType | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === InventoryCategoryType.Consumable || value === "Consumable") {
    return { ok: true, value: InventoryCategoryType.Consumable };
  }
  if (value === InventoryCategoryType.NonConsumable || value === "NonConsumable") {
    return { ok: true, value: InventoryCategoryType.NonConsumable };
  }
  return { ok: false, message: "categoryType must be Consumable or NonConsumable" };
}

function httpStatusForCategoryMutation(message: string): number {
  if (
    message === "Category not found" ||
    message.includes("Invalid consumableAccountId") ||
    message.includes("Invalid assetAccountId")
  )
    return 404;
  if (message.includes("already exists")) return 409;
  if (message === "name cannot be empty" || message === "name is required") {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * components:
 *   schemas:
 *     CategoryType:
 *       type: string
 *       enum: [Consumable, NonConsumable]
 *     Category:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [Active, Inactive, Archived]
 *         categoryType:
 *           $ref: '#/components/schemas/CategoryType'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         consumableAccountId:
 *           type: integer
 *           nullable: true
 *         consumableAccount:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             accountNo:
 *               type: string
 *               nullable: true
 *             accountDescription:
 *               type: string
 *         assetAccountId:
 *           type: integer
 *           nullable: true
 *         assetAccount:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             accountNo:
 *               type: string
 *               nullable: true
 *             accountDescription:
 *               type: string
 */

/**
 * @openapi
 * /api/v1/categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
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
 *                 example: "Stationery"
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: "Books, pens, paper, and related items"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *               categoryType:
 *                 $ref: '#/components/schemas/CategoryType'
 *                 description: Optional (defaults to Consumable)
 *               consumableAccountId:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional linked account chart for category postings
 *               assetAccountId:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional linked account chart for asset category postings
 *     responses:
 *       201:
 *         description: Category created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Category'
 *       400:
 *         description: Validation error (invalid categoryType or account ids)
 *       404:
 *         description: Invalid consumableAccountId or assetAccountId
 *       409:
 *         description: Duplicate category name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search category name or description (substring)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All for every status.
 *       - in: query
 *         name: categoryType
 *         schema:
 *           $ref: '#/components/schemas/CategoryType'
 *         description: Filter by inventory category type
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
 *         description: Paginated categories list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Category'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Invalid status or categoryType filter
 *       500:
 *         description: Server error
 */
export const categoryController = {
  createCategory: async (req: Request, res: Response) => {
    try {
      const { name, description, status, categoryType, consumableAccountId, assetAccountId } =
        req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      if (description !== undefined && description !== null && typeof description !== "string") {
        return res.status(400).json({
          success: false,
          message: "description must be a string or null",
        });
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

      const parsedCategoryType = parseCategoryTypeInput(categoryType);
      if (!parsedCategoryType.ok) {
        return res.status(400).json({ success: false, message: parsedCategoryType.message });
      }

      const parsedConsumable = parseConsumableAccountIdInput(consumableAccountId);
      if (!parsedConsumable.ok) {
        return res.status(400).json({
          success: false,
          message: parsedConsumable.message,
        });
      }

      const parsedAsset = parseAssetAccountIdInput(assetAccountId);
      if (!parsedAsset.ok) {
        return res.status(400).json({
          success: false,
          message: parsedAsset.message,
        });
      }

      const category = await categoryService.createCategory({
        name: name.trim(),
        description: description === undefined ? null : description,
        ...(status !== undefined ? { status } : {}),
        ...(parsedCategoryType.value !== undefined ? { categoryType: parsedCategoryType.value } : {}),
        ...(parsedConsumable.value !== undefined
          ? { consumableAccountId: parsedConsumable.value }
          : {}),
        ...(parsedAsset.value !== undefined ? { assetAccountId: parsedAsset.value } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create category";
      return res.status(httpStatusForCategoryMutation(message)).json({ success: false, message });
    }
  },

  listCategories: async (req: Request, res: Response) => {
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

      const categoryTypeRaw =
        typeof req.query.categoryType === "string" ? req.query.categoryType : undefined;
      const parsedCategoryType = parseCategoryTypeInput(categoryTypeRaw);
      if (!parsedCategoryType.ok) {
        return res.status(400).json({ success: false, message: parsedCategoryType.message });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await categoryService.listCategories({
        q,
        status,
        categoryType: parsedCategoryType.value,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Categories retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve categories",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/categories/{id}:
   *   get:
   *     summary: Get a category by ID
   *     tags: [Categories]
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
   *         description: Category details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   $ref: '#/components/schemas/Category'
   *       400:
   *         description: Missing id
   *       404:
   *         description: Category not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a category
   *     tags: [Categories]
   *     security:
   *       - bearerAuth: []
 *     description: All body fields are optional.
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
   *               categoryType:
   *                 $ref: '#/components/schemas/CategoryType'
   *               consumableAccountId:
   *                 type: integer
   *                 nullable: true
   *                 description: Pass null to disconnect the linked account chart.
 *               assetAccountId:
 *                 type: integer
 *                 nullable: true
 *                 description: Pass null to disconnect the linked asset account chart.
   *     responses:
   *       200:
   *         description: Category updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   $ref: '#/components/schemas/Category'
   *       400:
   *         description: Validation error
 *       404:
 *         description: Category not found or invalid account chart id(s)
   *       409:
   *         description: Duplicate category name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a category
   *     tags: [Categories]
   *     security:
   *       - bearerAuth: []
   *     description: Fails with 409 when subcategories or inventory items reference this category.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Deleted category returned in data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   $ref: '#/components/schemas/Category'
   *       400:
   *         description: Missing id
   *       404:
   *         description: Category not found
   *       409:
   *         description: Referenced by subcategories or inventory items
   *       500:
   *         description: Server error
   */
  getCategoryById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Category id parameter is required",
        });
      }

      const category = await categoryService.getCategoryById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      return res.json({
        success: true,
        message: "Category retrieved successfully",
        data: category,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve category",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateCategory: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const { name, description, status, categoryType, consumableAccountId, assetAccountId } =
        req.body ?? {};

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Category id parameter is required",
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

      const parsedCategoryType = parseCategoryTypeInput(categoryType);
      if (!parsedCategoryType.ok) {
        return res.status(400).json({ success: false, message: parsedCategoryType.message });
      }

      const parsedConsumable = parseConsumableAccountIdInput(consumableAccountId);
      if (!parsedConsumable.ok) {
        return res.status(400).json({
          success: false,
          message: parsedConsumable.message,
        });
      }

      const parsedAsset = parseAssetAccountIdInput(assetAccountId);
      if (!parsedAsset.ok) {
        return res.status(400).json({
          success: false,
          message: parsedAsset.message,
        });
      }

      const updated = await categoryService.updateCategory(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(parsedCategoryType.value !== undefined ? { categoryType: parsedCategoryType.value } : {}),
        ...(parsedConsumable.value !== undefined
          ? { consumableAccountId: parsedConsumable.value }
          : {}),
        ...(parsedAsset.value !== undefined ? { assetAccountId: parsedAsset.value } : {}),
      });

      return res.json({
        success: true,
        message: "Category updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update category";
      return res.status(httpStatusForCategoryMutation(message)).json({ success: false, message });
    }
  },

  deleteCategory: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Category id parameter is required",
        });
      }

      const deleted = await categoryService.deleteCategory(id);

      return res.json({
        success: true,
        message: "Category deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete category";
      const status = message === "Category not found" ? 404 : message.includes("Cannot delete") ? 409 : 500;
      return res.status(status).json({
        success: false,
        message,
        ...(status === 500 ? { error: message } : {}),
      });
    }
  },
};
