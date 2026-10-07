import { Request, Response } from "express";
import {
  ConcessionDiscountCalculationType,
  ConcessionDiscountType,
  Status,
} from "@prisma/client";
import { concessionDiscountService } from "../services/concessionDiscountService";
import { parseIntOrUndefined } from "../utils/request";

function parseNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseAppliesToIds(v: unknown): number[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  const parsed = v
    .map((x) => (typeof x === "number" ? x : typeof x === "string" ? Number.parseInt(x, 10) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length === v.length ? parsed : undefined;
}

/**
 * @openapi
 * /api/v1/concession-discounts:
 *   post:
 *     summary: Create a concession or discount
 *     tags: [ConcessionDiscounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, type, calculationType, value]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *               type: { type: string, enum: [CONCESSION, DISCOUNT] }
 *               calculationType: { type: string, enum: [PERCENTAGE, FIXED_AMOUNT] }
 *               value: { type: number }
 *               accountId: { type: integer, nullable: true }
 *               appliesToIds:
 *                 type: array
 *                 items: { type: integer }
 *               maxLimit: { type: number, nullable: true }
 *               status: { type: string, enum: [Active, Inactive, Archived] }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       409: { description: Duplicate code }
 *       500: { description: Server error }
 *   get:
 *     summary: List concessions/discounts
 *     tags: [ConcessionDiscounts]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [CONCESSION, DISCOUNT] }
 *       - in: query
 *         name: calculationType
 *         schema: { type: string, enum: [PERCENTAGE, FIXED_AMOUNT] }
 *       - in: query
 *         name: accountId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive, Archived, All] }
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
export const concessionDiscountController = {
  createConcessionDiscount: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};

      if (!body.code || typeof body.code !== "string" || !body.code.trim()) {
        return res.status(400).json({ success: false, message: "code is required" });
      }
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (!Object.values(ConcessionDiscountType).includes(body.type)) {
        return res.status(400).json({ success: false, message: "type is invalid" });
      }
      if (!Object.values(ConcessionDiscountCalculationType).includes(body.calculationType)) {
        return res.status(400).json({ success: false, message: "calculationType is invalid" });
      }

      const value = parseNumberOrUndefined(body.value);
      if (value === undefined) {
        return res.status(400).json({ success: false, message: "value must be a number" });
      }

      let accountId: number | null | undefined = undefined;
      if (body.accountId !== undefined) {
        if (body.accountId === null) {
          accountId = null;
        } else {
          const parsed = parseIntOrUndefined(String(body.accountId));
          if (parsed === undefined || parsed < 1) {
            return res.status(400).json({ success: false, message: "accountId must be a positive integer or null" });
          }
          accountId = parsed;
        }
      }

      let maxLimit: number | null | undefined = undefined;
      if (body.maxLimit !== undefined) {
        if (body.maxLimit === null) {
          maxLimit = null;
        } else {
          const parsed = parseNumberOrUndefined(body.maxLimit);
          if (parsed === undefined) {
            return res.status(400).json({ success: false, message: "maxLimit must be a number or null" });
          }
          maxLimit = parsed;
        }
      }

      const appliesToIds = parseAppliesToIds(body.appliesToIds);
      if (body.appliesToIds !== undefined && appliesToIds === undefined) {
        return res.status(400).json({ success: false, message: "appliesToIds must be an array of positive integers" });
      }

      if (body.status !== undefined && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const created = await concessionDiscountService.createConcessionDiscount({
        code: body.code.trim(),
        name: body.name.trim(),
        type: body.type as ConcessionDiscountType,
        calculationType: body.calculationType as ConcessionDiscountCalculationType,
        value,
        ...(accountId !== undefined ? { accountId } : {}),
        ...(appliesToIds !== undefined ? { appliesToIds } : {}),
        ...(maxLimit !== undefined ? { maxLimit } : {}),
        ...(body.status !== undefined ? { status: body.status as Status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Concession/discount created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create concession/discount";
      const status = message.includes("already exists")
        ? 409
        : message.includes("account chart not found")
          ? 404
          : message.includes("invalid") || message.includes("must be")
            ? 400
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  listConcessionDiscounts: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;

      const typeRaw = typeof req.query.type === "string" ? req.query.type : undefined;
      const type = typeRaw && Object.values(ConcessionDiscountType).includes(typeRaw as ConcessionDiscountType)
        ? (typeRaw as ConcessionDiscountType)
        : undefined;
      if (typeRaw !== undefined && type === undefined) {
        return res.status(400).json({ success: false, message: "type is invalid" });
      }

      const calculationTypeRaw =
        typeof req.query.calculationType === "string" ? req.query.calculationType : undefined;
      const calculationType =
        calculationTypeRaw &&
        Object.values(ConcessionDiscountCalculationType).includes(
          calculationTypeRaw as ConcessionDiscountCalculationType,
        )
          ? (calculationTypeRaw as ConcessionDiscountCalculationType)
          : undefined;
      if (calculationTypeRaw !== undefined && calculationType === undefined) {
        return res.status(400).json({ success: false, message: "calculationType is invalid" });
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

      const result = await concessionDiscountService.listConcessionDiscounts({
        q,
        type,
        calculationType,
        accountId,
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Concessions/discounts retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve concessions/discounts",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/concession-discounts/{id}:
   *   get:
   *     summary: Get concession/discount by ID
   *     tags: [ConcessionDiscounts]
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
   *     summary: Update concession/discount
   *     tags: [ConcessionDiscounts]
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
   *               type: { type: string, enum: [CONCESSION, DISCOUNT] }
   *               calculationType: { type: string, enum: [PERCENTAGE, FIXED_AMOUNT] }
   *               value: { type: number }
 *               accountId: { type: integer, nullable: true }
   *               appliesToIds:
   *                 type: array
   *                 items: { type: integer }
   *               maxLimit: { type: number, nullable: true }
   *               status: { type: string, enum: [Active, Inactive, Archived] }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       409: { description: Duplicate code }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete concession/discount
   *     tags: [ConcessionDiscounts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Deleted }
   *       400: { description: Invalid id }
   *       404: { description: Not found }
   *       500: { description: Server error }
   */
  getConcessionDiscountById: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const row = await concessionDiscountService.getConcessionDiscountById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Concession/discount not found" });
      }

      return res.json({
        success: true,
        message: "Concession/discount retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve concession/discount",
        error: error?.message,
      });
    }
  },

  updateConcessionDiscount: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const body = req.body ?? {};
      const hasCode = body.code !== undefined;
      const hasName = body.name !== undefined;
      const hasType = body.type !== undefined;
      const hasCalculationType = body.calculationType !== undefined;
      const hasValue = body.value !== undefined;
      const hasAccountId = body.accountId !== undefined;
      const hasAppliesToIds = body.appliesToIds !== undefined;
      const hasMaxLimit = body.maxLimit !== undefined;
      const hasStatus = body.status !== undefined;

      if (
        !hasCode &&
        !hasName &&
        !hasType &&
        !hasCalculationType &&
        !hasValue &&
        !hasAccountId &&
        !hasAppliesToIds &&
        !hasMaxLimit &&
        !hasStatus
      ) {
        return res.status(400).json({ success: false, message: "At least one field is required" });
      }

      if (hasCode && (typeof body.code !== "string" || !body.code.trim())) {
        return res.status(400).json({ success: false, message: "code must be non-empty string" });
      }
      if (hasName && (typeof body.name !== "string" || !body.name.trim())) {
        return res.status(400).json({ success: false, message: "name must be non-empty string" });
      }
      if (hasType && !Object.values(ConcessionDiscountType).includes(body.type)) {
        return res.status(400).json({ success: false, message: "type is invalid" });
      }
      if (
        hasCalculationType &&
        !Object.values(ConcessionDiscountCalculationType).includes(body.calculationType)
      ) {
        return res.status(400).json({ success: false, message: "calculationType is invalid" });
      }

      const value = hasValue ? parseNumberOrUndefined(body.value) : undefined;
      if (hasValue && value === undefined) {
        return res.status(400).json({ success: false, message: "value must be a number" });
      }
      let accountId: number | null | undefined = undefined;
      if (hasAccountId) {
        if (body.accountId === null) {
          accountId = null;
        } else {
          const parsed = parseIntOrUndefined(String(body.accountId));
          if (parsed === undefined || parsed < 1) {
            return res.status(400).json({ success: false, message: "accountId must be a positive integer or null" });
          }
          accountId = parsed;
        }
      }

      let maxLimit: number | null | undefined = undefined;
      if (hasMaxLimit) {
        if (body.maxLimit === null) {
          maxLimit = null;
        } else {
          const parsed = parseNumberOrUndefined(body.maxLimit);
          if (parsed === undefined) {
            return res.status(400).json({ success: false, message: "maxLimit must be a number or null" });
          }
          maxLimit = parsed;
        }
      }

      const appliesToIds = hasAppliesToIds ? parseAppliesToIds(body.appliesToIds) : undefined;
      if (hasAppliesToIds && appliesToIds === undefined) {
        return res.status(400).json({ success: false, message: "appliesToIds must be an array of positive integers" });
      }

      if (hasStatus && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const existing = await concessionDiscountService.getConcessionDiscountById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Concession/discount not found" });
      }

      const updated = await concessionDiscountService.updateConcessionDiscount(id, {
        ...(hasCode ? { code: body.code.trim() } : {}),
        ...(hasName ? { name: body.name.trim() } : {}),
        ...(hasType ? { type: body.type as ConcessionDiscountType } : {}),
        ...(hasCalculationType
          ? { calculationType: body.calculationType as ConcessionDiscountCalculationType }
          : {}),
        ...(hasValue ? { value: value! } : {}),
        ...(hasAccountId ? { accountId } : {}),
        ...(hasAppliesToIds ? { appliesToIds: appliesToIds! } : {}),
        ...(hasMaxLimit ? { maxLimit } : {}),
        ...(hasStatus ? { status: body.status as Status } : {}),
      });

      return res.json({
        success: true,
        message: "Concession/discount updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update concession/discount";
      const status =
        message.includes("already exists")
          ? 409
          : message.includes("account chart not found")
            ? 404
            : message.includes("must be") || message.includes("invalid")
              ? 400
              : message.includes("not found")
                ? 404
                : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  deleteConcessionDiscount: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const existing = await concessionDiscountService.getConcessionDiscountById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Concession/discount not found" });
      }

      const deleted = await concessionDiscountService.deleteConcessionDiscount(id);
      return res.json({
        success: true,
        message: "Concession/discount deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete concession/discount",
        error: error?.message,
      });
    }
  },
};
