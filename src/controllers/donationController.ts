import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import { donationService } from "../services/donationService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

/**
 * @openapi
 * /api/v1/donations:
 *   post:
 *     summary: Create a donation inventory transaction
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     description: Creates an InventoryTransaction with transactionType=donation (locked). Status is completed. sessionId/termId from active period. referenceNo is auto-generated if missing or empty. notes is required. storeId is required (destination store for the donation stock).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, qtyIn, notes, storeId]
 *             properties:
 *               itemId:
 *                 type: string
 *               storeId:
 *                 type: string
 *                 format: uuid
 *                 description: Store receiving the donated stock
 *               qtyIn:
 *                 oneOf: [{ type: string }, { type: number }]
 *               notes:
 *                 type: string
 *               referenceNo:
 *                 type: string
 *                 nullable: true
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Donation created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Item or store not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List donation transactions
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search referenceNo/notes
 *       - in: query
 *         name: itemId
 *         schema:
 *           type: string
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional filter by store id
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, cancelled, deleted, completed]
 *       - in: query
 *         name: transactionDateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: transactionDateTo
 *         schema:
 *           type: string
 *           format: date
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
 *         description: Donations list
 *       500:
 *         description: Server error
 */
export const donationController = {
  /**
   * @openapi
   * /api/v1/donations/bulk:
   *   post:
   *     summary: Create multiple donation transactions (bulk)
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
 *     description: Shared storeId/notes/referenceNo/transactionDate; items[].itemId and items[].qtyIn vary. notes required. referenceNo auto if missing. storeId required for all lines.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notes, items, storeId]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *                 description: Store receiving the donated stock (applied to each row)
 *               notes:
 *                 type: string
 *               referenceNo:
   *                 type: string
   *                 nullable: true
   *               transactionDate:
   *                 type: string
   *                 format: date-time
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [itemId, qtyIn]
   *                   properties:
   *                     itemId: { type: string }
   *                     qtyIn:
   *                       oneOf: [{ type: string }, { type: number }]
   *     responses:
   *       201: { description: Donations created }
   *       400: { description: Validation error }
   *       404: { description: Invalid itemId or storeId }
   */
  createBulkDonations: async (req: Request, res: Response) => {
    try {
      const { storeId, referenceNo, notes, transactionDate, items } = req.body ?? {};

      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }

      if (notes === undefined || notes === null || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ success: false, message: "notes is required and must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }
      const parsedDate =
        transactionDate === undefined
          ? undefined
          : (() => {
              const d = new Date(transactionDate);
              return Number.isNaN(d.getTime()) ? null : d;
            })();
      if (parsedDate === null) {
        return res.status(400).json({ success: false, message: "transactionDate is invalid" });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "items is required and must be a non-empty array" });
      }

      const normalizedItems: Array<{ itemId: string; qtyIn: string | number }> = [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res.status(400).json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qtyIn } = it as Record<string, unknown>;
        if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
          return res.status(400).json({ success: false, message: `items[${idx}].itemId is required` });
        }
        if (!isNumberOrString(qtyIn)) {
          return res.status(400).json({ success: false, message: `items[${idx}].qtyIn is required (string or number)` });
        }
        const qtyInNum = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
        if (!Number.isFinite(qtyInNum) || qtyInNum <= 0) {
          return res.status(400).json({ success: false, message: `items[${idx}].qtyIn must be greater than 0` });
        }

        normalizedItems.push({ itemId: itemId.trim(), qtyIn });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await donationService.createBulkDonations({
        storeId: storeId.trim(),
        notes: notes.trim(),
        referenceNo: referenceNo === undefined ? null : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
        items: normalizedItems,
      });

      return res.status(201).json({ success: true, message: "Donations created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create donations";
      const code = message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/donations/bulk:
   *   put:
   *     summary: Update multiple donation transactions (bulk)
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [updates]
   *             properties:
   *               updates:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [id]
   *                   properties:
   *                     id: { type: string }
   *                     itemId: { type: string }
   *                     qtyIn: { oneOf: [{ type: string }, { type: number }] }
   *                     referenceNo: { type: string, nullable: true }
   *                     notes: { type: string }
   *                     transactionDate: { type: string, format: date-time }
   *     responses:
   *       200: { description: Donations updated }
   *       400: { description: Validation error }
   *       404: { description: Donation/item not found }
   */
  updateBulkDonations: async (req: Request, res: Response) => {
    try {
      const { updates } = req.body ?? {};
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, message: "updates is required and must be a non-empty array" });
      }

      const normalizedUpdates: Array<{
        id: string;
        itemId?: string;
        qtyIn?: string | number;
        referenceNo?: string | null;
        notes?: string;
        transactionDate?: Date;
      }> = [];

      for (const [idx, u] of updates.entries()) {
        if (!u || typeof u !== "object") {
          return res.status(400).json({ success: false, message: `updates[${idx}] must be an object` });
        }
        const { id, itemId, qtyIn, referenceNo, notes, transactionDate } = u as Record<string, unknown>;
        if (!id || typeof id !== "string" || !id.trim()) {
          return res.status(400).json({ success: false, message: `updates[${idx}].id is required` });
        }
        if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].itemId must be a non-empty string` });
        }
        if (qtyIn !== undefined && !isNumberOrString(qtyIn)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].qtyIn must be a string or number` });
        }
        if (qtyIn !== undefined) {
          const n = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
          if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ success: false, message: `updates[${idx}].qtyIn must be greater than 0` });
          }
        }
        if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].referenceNo must be a string or null` });
        }
        if (notes !== undefined && (typeof notes !== "string" || !notes.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].notes must be a non-empty string if provided` });
        }
        if (transactionDate !== undefined && typeof transactionDate !== "string") {
          return res.status(400).json({ success: false, message: `updates[${idx}].transactionDate must be an ISO date string` });
        }
        const parsedDate =
          transactionDate === undefined
            ? undefined
            : (() => {
                const d = new Date(transactionDate as string);
                return Number.isNaN(d.getTime()) ? null : d;
              })();
        if (parsedDate === null) {
          return res.status(400).json({ success: false, message: `updates[${idx}].transactionDate is invalid` });
        }

        normalizedUpdates.push({
          id: id.trim(),
          ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
          ...(qtyIn !== undefined ? { qtyIn } : {}),
          ...(referenceNo !== undefined ? { referenceNo: referenceNo as string | null } : {}),
          ...(notes !== undefined ? { notes: (notes as string).trim() } : {}),
          ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await donationService.updateBulkDonations({ updates: normalizedUpdates });
      return res.json({ success: true, message: "Donations updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update donations";
      const status =
        message === "notes cannot be empty"
          ? 400
          : message.startsWith("Invalid ") || message.startsWith("Donation not found")
            ? 404
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/donations/bulk:
   *   delete:
   *     summary: Delete multiple donation transactions (bulk)
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [ids]
   *             properties:
   *               ids:
   *                 type: array
   *                 minItems: 1
   *                 items: { type: string }
   *     responses:
   *       200: { description: Donations deleted }
   *       404: { description: Donation not found }
   */
  deleteBulkDonations: async (req: Request, res: Response) => {
    try {
      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "ids is required and must be a non-empty array" });
      }
      for (const [idx, id] of ids.entries()) {
        if (!id || typeof id !== "string" || !id.trim()) {
          return res.status(400).json({ success: false, message: `ids[${idx}] must be a non-empty string` });
        }
      }
      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await donationService.deleteBulkDonations({ ids: ids.map((s: string) => s.trim()) });
      return res.json({ success: true, message: "Donations deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete donations";
      const code = message.startsWith("Donation not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  createDonation: async (req: Request, res: Response) => {
    try {
      const { itemId, storeId, qtyIn, referenceNo, notes, transactionDate } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }
      if (!isNumberOrString(qtyIn)) {
        return res.status(400).json({ success: false, message: "qtyIn is required (string or number)" });
      }
      const qtyInNum = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
      if (!Number.isFinite(qtyInNum) || qtyInNum <= 0) {
        return res.status(400).json({ success: false, message: "qtyIn must be greater than 0" });
      }
      if (notes === undefined || notes === null || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ success: false, message: "notes is required and must be a non-empty string" });
      }
      if (referenceNo !== undefined && referenceNo !== null && typeof referenceNo !== "string") {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }
      const parsedDate =
        transactionDate === undefined
          ? undefined
          : (() => {
              const d = new Date(transactionDate);
              return Number.isNaN(d.getTime()) ? null : d;
            })();
      if (parsedDate === null) {
        return res.status(400).json({ success: false, message: "transactionDate is invalid" });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await donationService.createDonation({
        itemId: itemId.trim(),
        storeId: storeId.trim(),
        qtyIn,
        notes: notes.trim(),
        referenceNo: referenceNo === undefined ? undefined : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
      });

      return res.status(201).json({ success: true, message: "Donation created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create donation";
      const code = message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listDonations: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;
      const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const termId = typeof req.query.termId === "string" ? req.query.termId : undefined;

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "pending"
            ? InventoryTransactionStatus.pending
            : statusRaw === "cancelled"
              ? InventoryTransactionStatus.cancelled
              : statusRaw === "deleted"
                ? InventoryTransactionStatus.deleted
                : statusRaw === "completed"
                  ? InventoryTransactionStatus.completed
                  : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);
      if (fromRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      if (toRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;
      if (transactionDateFrom && transactionDateTo && transactionDateFrom.getTime() > transactionDateTo.getTime()) {
        return res.status(400).json({ success: false, message: "transactionDateFrom must be before or equal to transactionDateTo" });
      }

      const result = await donationService.listDonations({
        q,
        itemId,
        storeId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({ success: true, message: "Donations retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve donations", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/donations/grouped:
   *   get:
   *     summary: List donation transactions grouped by referenceNo
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Same query filters as GET /donations. Pagination applies to reference groups (not individual lines).
   *       Each group includes referenceNo and all donation rows for that reference.
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *         description: Search referenceNo/notes
   *       - in: query
   *         name: itemId
   *         schema:
   *           type: string
   *       - in: query
   *         name: storeId
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: sessionId
   *         schema:
   *           type: string
   *       - in: query
   *         name: termId
   *         schema:
   *           type: string
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, cancelled, deleted, completed]
   *       - in: query
   *         name: transactionDateFrom
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: transactionDateTo
   *         schema:
   *           type: string
   *           format: date
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
   *         description: Donation groups by referenceNo
   *       400:
   *         description: Validation error
   *       500:
   *         description: Server error
   */
  listDonationsGroupedByReference: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;
      const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const termId = typeof req.query.termId === "string" ? req.query.termId : undefined;

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "pending"
            ? InventoryTransactionStatus.pending
            : statusRaw === "cancelled"
              ? InventoryTransactionStatus.cancelled
              : statusRaw === "deleted"
                ? InventoryTransactionStatus.deleted
                : statusRaw === "completed"
                  ? InventoryTransactionStatus.completed
                  : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);
      if (fromRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      if (toRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;
      if (transactionDateFrom && transactionDateTo && transactionDateFrom.getTime() > transactionDateTo.getTime()) {
        return res.status(400).json({ success: false, message: "transactionDateFrom must be before or equal to transactionDateTo" });
      }

      const result = await donationService.listDonationsGroupedByReference({
        q,
        itemId,
        storeId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Donations grouped by reference retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve grouped donations",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/donations/summary:
   *   get:
   *     summary: Summary of donated quantities (grouped by item)
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     description: Sum(qtyIn) grouped by itemId for transactionType=donation. Same filters as list.
   *     parameters:
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *       - in: query
   *         name: itemId
   *         schema: { type: string }
   *       - in: query
   *         name: storeId
   *         schema: { type: string, format: uuid }
   *         description: Optional filter by store id
   *       - in: query
   *         name: sessionId
   *         schema: { type: string }
   *       - in: query
   *         name: termId
   *         schema: { type: string }
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, cancelled, deleted, completed]
   *       - in: query
   *         name: transactionDateFrom
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: transactionDateTo
   *         schema: { type: string, format: date }
   *     responses:
   *       200: { description: Summary rows sorted by category, subCategory, brand, item name }
   */
  getDonationSummary: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;
      const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const termId = typeof req.query.termId === "string" ? req.query.termId : undefined;

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "pending"
            ? InventoryTransactionStatus.pending
            : statusRaw === "cancelled"
              ? InventoryTransactionStatus.cancelled
              : statusRaw === "deleted"
                ? InventoryTransactionStatus.deleted
                : statusRaw === "completed"
                  ? InventoryTransactionStatus.completed
                  : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);
      if (fromRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      if (toRaw === "invalid") return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;
      if (transactionDateFrom && transactionDateTo && transactionDateFrom.getTime() > transactionDateTo.getTime()) {
        return res.status(400).json({ success: false, message: "transactionDateFrom must be before or equal to transactionDateTo" });
      }

      const result = await donationService.summarizeDonationsByItem({
        q,
        itemId,
        storeId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
      });
      return res.json({ success: true, message: "Donation summary retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve donation summary", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/donations/{id}:
   *   get:
   *     summary: Get a donation transaction by ID
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Donation details }
   *       404: { description: Donation not found }
   *   put:
   *     summary: Update a donation transaction
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     description: transactionType stays donation; status stays completed; sessionId/termId refresh from active period.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               itemId: { type: string }
   *               qtyIn: { oneOf: [{ type: string }, { type: number }] }
   *               referenceNo: { type: string, nullable: true }
   *               notes: { type: string }
   *               transactionDate: { type: string, format: date-time }
   *     responses:
   *       200: { description: Donation updated }
   *       404: { description: Donation/item not found }
   *   delete:
   *     summary: Delete a donation transaction
   *     tags: [Donations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Donation deleted }
   *       404: { description: Donation not found }
   */
  getDonationById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await donationService.getDonationById(id);
      if (!row) return res.status(404).json({ success: false, message: "Donation not found" });
      return res.json({ success: true, message: "Donation retrieved successfully", data: row });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve donation", error: error?.message });
    }
  },

  updateDonation: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { itemId, qtyIn, referenceNo, notes, transactionDate } = req.body ?? {};
      if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
        return res.status(400).json({ success: false, message: "itemId must be a non-empty string" });
      }
      if (qtyIn !== undefined && !isNumberOrString(qtyIn)) {
        return res.status(400).json({ success: false, message: "qtyIn must be a string or number" });
      }
      if (qtyIn !== undefined) {
        const n = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ success: false, message: "qtyIn must be greater than 0" });
        }
      }
      if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (notes !== undefined && (typeof notes !== "string" || !notes.trim())) {
        return res.status(400).json({ success: false, message: "notes must be a non-empty string if provided" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }

      let parsedTxDate: Date | undefined;
      if (transactionDate !== undefined) {
        const d = new Date(transactionDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: "transactionDate is invalid" });
        }
        parsedTxDate = d;
      }

      const updated = await donationService.updateDonation(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(qtyIn !== undefined ? { qtyIn } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(parsedTxDate !== undefined ? { transactionDate: parsedTxDate } : {}),
      });

      return res.json({ success: true, message: "Donation updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update donation";
      const code = message === "Donation not found" || message.startsWith("Invalid ") ? 404 : 500;
      const http = message === "notes cannot be empty" ? 400 : code;
      return res.status(http).json({ success: false, message });
    }
  },

  deleteDonation: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await donationService.deleteDonation(id);
      return res.json({ success: true, message: "Donation deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete donation";
      const code = message === "Donation not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
