import { Request, Response } from "express";
import { BillingItemCategory, Status } from "@prisma/client";
import { billingItemService } from "../services/billingItemService";
import { parseIntOrUndefined } from "../utils/request";

/**
 * @openapi
 * /api/v1/billing-items:
 *   post:
 *     summary: Create a billing item
 *     tags: [BillingItems]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, category]
 *             properties:
 *               code: { type: string, example: TUI001 }
 *               name: { type: string, example: Tuition Fee }
 *               category:
 *                 type: string
 *                 enum: [TUITION, MATERIALS, SERVICES, TRANSPORTATION, TECHNOLOGY, UTILITIES, CONSTRUCTION, FEEDING, MEDICAL, OTHER]
 *               accountId: { type: integer, nullable: true }
 *               optional: { type: boolean }
 *               status: { type: string, enum: [Active, Inactive, Archived] }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       409: { description: Duplicate code }
 *       500: { description: Server error }
 *   get:
 *     summary: List billing items
 *     tags: [BillingItems]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [TUITION, MATERIALS, SERVICES, TRANSPORTATION, TECHNOLOGY, UTILITIES, CONSTRUCTION, FEEDING, MEDICAL, OTHER]
 *       - in: query
 *         name: accountId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: List }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/billing-items/categories:
 *   get:
 *     summary: List billing item categories
 *     description: Returns all supported BillingItemCategory enum values for frontend dropdown uniformity.
 *     tags: [BillingItems]
 *     responses:
 *       200:
 *         description: Categories retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Billing item categories retrieved successfully }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                     enum: [TUITION, MATERIALS, SERVICES, TRANSPORTATION, TECHNOLOGY, UTILITIES, CONSTRUCTION, FEEDING, MEDICAL, OTHER]
 */
export const billingItemController = {
  listBillingItemCategories: async (_req: Request, res: Response) => {
    return res.json({
      success: true,
      message: "Billing item categories retrieved successfully",
      data: Object.values(BillingItemCategory),
    });
  },

  createBillingItem: async (req: Request, res: Response) => {
    try {
      const { code, name, category, accountId, optional, status } = req.body ?? {};

      if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ success: false, message: "code is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (!category || !Object.values(BillingItemCategory).includes(category)) {
        return res.status(400).json({ success: false, message: "category is invalid" });
      }
      let parsedAccountId: number | null | undefined;
      if (accountId !== undefined) {
        if (accountId === null) {
          parsedAccountId = null;
        } else {
          const n =
            typeof accountId === "number" && Number.isInteger(accountId)
              ? accountId
              : typeof accountId === "string"
                ? Number.parseInt(accountId, 10)
                : NaN;
          if (!Number.isFinite(n) || n < 1) {
            return res
              .status(400)
              .json({ success: false, message: "accountId must be a positive integer or null" });
          }
          parsedAccountId = n;
        }
      }
      if (optional !== undefined && typeof optional !== "boolean") {
        return res.status(400).json({ success: false, message: "optional must be boolean" });
      }
      if (status !== undefined && !Object.values(Status).includes(status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const created = await billingItemService.createBillingItem({
        code: code.trim(),
        name: name.trim(),
        category,
        ...(parsedAccountId !== undefined ? { accountId: parsedAccountId } : {}),
        ...(optional !== undefined ? { optional } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Billing item created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create billing item";
      const status = message.includes("already exists")
        ? 409
        : message.includes("account chart not found")
          ? 404
          : message.includes("accountId must")
            ? 400
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  listBillingItems: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const categoryRaw = typeof req.query.category === "string" ? req.query.category : undefined;
      const category = categoryRaw && Object.values(BillingItemCategory).includes(categoryRaw as BillingItemCategory)
        ? (categoryRaw as BillingItemCategory)
        : undefined;
      if (categoryRaw !== undefined && category === undefined) {
        return res.status(400).json({ success: false, message: "category is invalid" });
      }
      const accountIdRaw = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
      const accountId = accountIdRaw !== undefined ? parseIntOrUndefined(accountIdRaw) : undefined;
      if (accountIdRaw !== undefined && (accountId === undefined || accountId < 1)) {
        return res.status(400).json({ success: false, message: "accountId must be a positive integer" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : Object.values(Status).includes(statusRaw as Status)
              ? (statusRaw as Status)
              : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await billingItemService.listBillingItems({
        q,
        category,
        accountId,
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Billing items retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve billing items",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/billing-items/{id}:
   *   get:
   *     summary: Get billing item by ID
   *     tags: [BillingItems]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Invalid id }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   put:
   *     summary: Update billing item
   *     tags: [BillingItems]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               code: { type: string }
   *               name: { type: string }
   *               category:
   *                 type: string
   *                 enum: [TUITION, MATERIALS, SERVICES, TRANSPORTATION, TECHNOLOGY, UTILITIES, CONSTRUCTION, FEEDING, MEDICAL, OTHER]
 *               accountId: { type: integer, nullable: true }
   *               optional: { type: boolean }
   *               status: { type: string, enum: [Active, Inactive, Archived] }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       409: { description: Duplicate code }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete billing item
   *     tags: [BillingItems]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Deleted }
   *       400: { description: Invalid id }
   *       404: { description: Not found }
   *       409: { description: Referenced by concessions }
   *       500: { description: Server error }
   */
  getBillingItemById: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const row = await billingItemService.getBillingItemById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Billing item not found" });
      }

      return res.json({
        success: true,
        message: "Billing item retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve billing item",
        error: error?.message,
      });
    }
  },

  updateBillingItem: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const body = req.body ?? {};
      const hasCode = body.code !== undefined;
      const hasName = body.name !== undefined;
      const hasCategory = body.category !== undefined;
      const hasAccountId = body.accountId !== undefined;
      const hasOptional = body.optional !== undefined;
      const hasStatus = body.status !== undefined;

      if (!hasCode && !hasName && !hasCategory && !hasAccountId && !hasOptional && !hasStatus) {
        return res.status(400).json({ success: false, message: "At least one field is required" });
      }

      if (hasCode && (typeof body.code !== "string" || !body.code.trim())) {
        return res.status(400).json({ success: false, message: "code must be non-empty string" });
      }
      if (hasName && (typeof body.name !== "string" || !body.name.trim())) {
        return res.status(400).json({ success: false, message: "name must be non-empty string" });
      }
      if (hasCategory && !Object.values(BillingItemCategory).includes(body.category)) {
        return res.status(400).json({ success: false, message: "category is invalid" });
      }
      let parsedAccountId: number | null | undefined;
      if (hasAccountId) {
        if (body.accountId === null) {
          parsedAccountId = null;
        } else {
          const n =
            typeof body.accountId === "number" && Number.isInteger(body.accountId)
              ? body.accountId
              : typeof body.accountId === "string"
                ? Number.parseInt(body.accountId, 10)
                : NaN;
          if (!Number.isFinite(n) || n < 1) {
            return res
              .status(400)
              .json({ success: false, message: "accountId must be a positive integer or null" });
          }
          parsedAccountId = n;
        }
      }
      if (hasOptional && typeof body.optional !== "boolean") {
        return res.status(400).json({ success: false, message: "optional must be boolean" });
      }
      if (hasStatus && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const existing = await billingItemService.getBillingItemById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Billing item not found" });
      }

      const updated = await billingItemService.updateBillingItem(id, {
        ...(hasCode ? { code: body.code.trim() } : {}),
        ...(hasName ? { name: body.name.trim() } : {}),
        ...(hasCategory ? { category: body.category as BillingItemCategory } : {}),
        ...(hasAccountId ? { accountId: parsedAccountId } : {}),
        ...(hasOptional ? { optional: body.optional as boolean } : {}),
        ...(hasStatus ? { status: body.status as Status } : {}),
      });

      return res.json({
        success: true,
        message: "Billing item updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update billing item";
      const status =
        message.includes("already exists")
          ? 409
          : message.includes("account chart not found")
            ? 404
            : message.includes("accountId must")
              ? 400
              : message.includes("not found")
                ? 404
                : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  deleteBillingItem: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const existing = await billingItemService.getBillingItemById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Billing item not found" });
      }

      const deleted = await billingItemService.deleteBillingItem(id);
      return res.json({
        success: true,
        message: "Billing item deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete billing item";
      const status = message.includes("Cannot delete") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
