import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import { staffCollectionService } from "../services/staffCollectionService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function httpStatusForStaffCollectionCreate(message: string): number {
  if (message.startsWith("Invalid ")) return 404;
  if (message.includes("not authorized to issue items")) return 403;
  return 500;
}

/**
 * @openapi
 * /api/v1/staff-collections:
 *   post:
 *     summary: Create a staff inventory collection transaction
 *     tags: [StaffCollections]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates an InventoryTransaction with transactionType=staff_collection (locked). Status defaults to completed. sessionId/termId derived from active period; referenceNo auto-generated if missing.
 *       storeId optional — must be a store you manage; if omitted, the first store you manage (by name) is used. If you manage no store, the request is rejected (403).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, staffId, qtyOut]
 *             properties:
 *               itemId:
 *                 type: string
 *               staffId:
 *                 type: string
 *               qtyOut:
 *                 oneOf: [{ type: string }, { type: number }]
 *               outCost:
 *                 oneOf: [{ type: string }, { type: number }]
 *                 description: Optional. Defaults to 0.
 *               referenceNo:
 *                 type: string
 *                 nullable: true
 *               notes:
 *                 type: string
 *                 nullable: true
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Optional. Defaults to today.
 *               storeId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. Must be a store you manage; defaults to first managed store by name.
 *     responses:
 *       201:
 *         description: Staff collection created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Issuer is not allowed to issue from store(s)
 *       404:
 *         description: Referenced item/staff/store not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List staff collection transactions
 *     tags: [StaffCollections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search in referenceNo/notes
 *       - in: query
 *         name: itemId
 *         schema:
 *           type: string
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Optional filter by session ID
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *         description: Optional filter by term ID
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
 *         description: Staff collections list
 *       500:
 *         description: Server error
 */
export const staffCollectionController = {
  /**
   * @openapi
   * /api/v1/staff-collections/bulk:
   *   post:
   *     summary: Create multiple staff collection transactions (bulk)
   *     tags: [StaffCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Creates multiple InventoryTransaction rows with transactionType=staff_collection (locked). Status defaults to completed. Shared staffId/referenceNo/notes/transactionDate/storeId; only items[].itemId and items[].qtyOut/outCost vary.
   *       storeId optional — same rules as single create (defaults to first managed store; 403 if not a store manager).
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [staffId, items]
   *             properties:
   *               staffId:
   *                 type: string
   *               referenceNo:
   *                 type: string
   *                 nullable: true
   *               notes:
   *                 type: string
   *                 nullable: true
   *               transactionDate:
   *                 type: string
   *                 format: date-time
   *               storeId:
   *                 type: string
   *                 nullable: true
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [itemId, qtyOut]
   *                   properties:
   *                     itemId: { type: string }
   *                     qtyOut:
   *                       oneOf: [{ type: string }, { type: number }]
   *                     outCost:
   *                       oneOf: [{ type: string }, { type: number }]
   *     responses:
   *       201: { description: Staff collections created }
   *       400: { description: Validation error }
   *       403: { description: Issuer is not allowed to issue from store(s) }
   *       404: { description: Referenced item/staff/store not found }
   */
  createBulkStaffCollections: async (req: Request, res: Response) => {
    try {
      const { staffId, referenceNo, notes, transactionDate, items, storeId } = req.body ?? {};
      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }
      if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || !storeId.trim())) {
        return res.status(400).json({ success: false, message: "storeId must be a non-empty string or null" });
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

      const normalizedItems: Array<{ itemId: string; qtyOut: string | number; outCost?: string | number }> = [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res.status(400).json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qtyOut, outCost } = it as any;
        if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
          return res.status(400).json({ success: false, message: `items[${idx}].itemId is required` });
        }
        if (!isNumberOrString(qtyOut)) {
          return res.status(400).json({ success: false, message: `items[${idx}].qtyOut is required (string or number)` });
        }
        const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
        if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
          return res.status(400).json({ success: false, message: `items[${idx}].qtyOut must be greater than 0` });
        }
        if (outCost !== undefined && !isNumberOrString(outCost)) {
          return res.status(400).json({ success: false, message: `items[${idx}].outCost must be a string or number` });
        }
        if (outCost !== undefined) {
          const outCostNum = typeof outCost === "string" ? Number(outCost) : outCost;
          if (!Number.isFinite(outCostNum) || outCostNum < 0) {
            return res.status(400).json({ success: false, message: `items[${idx}].outCost must be >= 0` });
          }
        }

        normalizedItems.push({ itemId: itemId.trim(), qtyOut, ...(outCost !== undefined ? { outCost } : {}) });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await staffCollectionService.createBulkStaffCollections({
        staffId: staffId.trim(),
        referenceNo: referenceNo === undefined ? null : referenceNo,
        notes: notes === undefined ? null : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
        items: normalizedItems,
      });

      return res.status(201).json({ success: true, message: "Staff collections created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create staff collections";
      return res.status(httpStatusForStaffCollectionCreate(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-collections/bulk:
   *   put:
   *     summary: Update multiple staff collection transactions (bulk)
   *     tags: [StaffCollections]
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
   *                     staffId: { type: string, nullable: true }
   *                     qtyOut: { oneOf: [{ type: string }, { type: number }] }
   *                     outCost: { oneOf: [{ type: string }, { type: number }] }
   *                     referenceNo: { type: string, nullable: true }
   *                     notes: { type: string, nullable: true }
   *                     transactionDate: { type: string, format: date-time }
   *     responses:
   *       200: { description: Staff collections updated }
   *       400: { description: Validation error }
   *       404: { description: Staff collection/item/staff not found }
   */
  updateBulkStaffCollections: async (req: Request, res: Response) => {
    try {
      const { updates } = req.body ?? {};
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, message: "updates is required and must be a non-empty array" });
      }

      const normalizedUpdates: Array<any> = [];
      for (const [idx, u] of updates.entries()) {
        if (!u || typeof u !== "object") {
          return res.status(400).json({ success: false, message: `updates[${idx}] must be an object` });
        }
        const { id, itemId, staffId, qtyOut, outCost, referenceNo, notes, transactionDate } = u as any;
        if (!id || typeof id !== "string" || !id.trim()) {
          return res.status(400).json({ success: false, message: `updates[${idx}].id is required` });
        }
        if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].itemId must be a non-empty string` });
        }
        if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].staffId must be a non-empty string or null` });
        }
        if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].qtyOut must be a string or number` });
        }
        if (qtyOut !== undefined) {
          const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
          if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
            return res.status(400).json({ success: false, message: `updates[${idx}].qtyOut must be greater than 0` });
          }
        }
        if (outCost !== undefined && !isNumberOrString(outCost)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].outCost must be a string or number` });
        }
        if (outCost !== undefined) {
          const outCostNum = typeof outCost === "string" ? Number(outCost) : outCost;
          if (!Number.isFinite(outCostNum) || outCostNum < 0) {
            return res.status(400).json({ success: false, message: `updates[${idx}].outCost must be >= 0` });
          }
        }
        if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].referenceNo must be a string or null` });
        }
        if (notes !== undefined && !isStringOrNullOrUndefined(notes)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].notes must be a string or null` });
        }
        if (transactionDate !== undefined && typeof transactionDate !== "string") {
          return res.status(400).json({ success: false, message: `updates[${idx}].transactionDate must be an ISO date string` });
        }
        const parsedDate =
          transactionDate === undefined
            ? undefined
            : (() => {
                const d = new Date(transactionDate);
                return Number.isNaN(d.getTime()) ? null : d;
              })();
        if (parsedDate === null) {
          return res.status(400).json({ success: false, message: `updates[${idx}].transactionDate is invalid` });
        }

        normalizedUpdates.push({
          id: id.trim(),
          ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
          ...(staffId !== undefined ? { staffId: staffId === null ? null : staffId.trim() } : {}),
          ...(qtyOut !== undefined ? { qtyOut } : {}),
          ...(outCost !== undefined ? { outCost } : {}),
          ...(referenceNo !== undefined ? { referenceNo } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await staffCollectionService.updateBulkStaffCollections({ updates: normalizedUpdates });
      return res.json({ success: true, message: "Staff collections updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update staff collections";
      const code = message.startsWith("Invalid ") || message.startsWith("Staff collection not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-collections/bulk:
   *   delete:
   *     summary: Delete multiple staff collection transactions (bulk)
   *     tags: [StaffCollections]
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
   *       200: { description: Staff collections deleted }
   *       404: { description: Staff collection not found }
   */
  deleteBulkStaffCollections: async (req: Request, res: Response) => {
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

      const deleted = await staffCollectionService.deleteBulkStaffCollections({ ids: ids.map((s: string) => s.trim()) });
      return res.json({ success: true, message: "Staff collections deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete staff collections";
      const code = message.startsWith("Staff collection not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  createStaffCollection: async (req: Request, res: Response) => {
    try {
      const { itemId, staffId, qtyOut, outCost, referenceNo, notes, transactionDate, storeId } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!isNumberOrString(qtyOut)) {
        return res.status(400).json({ success: false, message: "qtyOut is required (string or number)" });
      }
      const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
      if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
        return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
      }
      if (outCost !== undefined && !isNumberOrString(outCost)) {
        return res.status(400).json({ success: false, message: "outCost must be a string or number" });
      }
      if (outCost !== undefined) {
        const outCostNum = typeof outCost === "string" ? Number(outCost) : outCost;
        if (!Number.isFinite(outCostNum) || outCostNum < 0) {
          return res.status(400).json({ success: false, message: "outCost must be >= 0" });
        }
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }
      if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || !storeId.trim())) {
        return res.status(400).json({ success: false, message: "storeId must be a non-empty string or null" });
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

      const created = await staffCollectionService.createStaffCollection({
        itemId: itemId.trim(),
        staffId: staffId.trim(),
        qtyOut,
        ...(outCost !== undefined ? { outCost } : {}),
        referenceNo: referenceNo === undefined || referenceNo === null || referenceNo.trim() === "" ? null : referenceNo,
        notes: notes === undefined || notes === null || notes.trim() === "" ? null : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
      });

      return res.status(201).json({ success: true, message: "Staff collection created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create staff collection";
      return res.status(httpStatusForStaffCollectionCreate(message)).json({ success: false, message });
    }
  },

  listStaffCollections: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
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

      const result = await staffCollectionService.listStaffCollections({
        q,
        itemId,
        staffId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({ success: true, message: "Staff collections retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve staff collections", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-collections/summary:
   *   get:
   *     summary: Summary of staff-collected items (grouped by item)
   *     tags: [StaffCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Returns sum(qtyOut) grouped by itemId for transactions with transactionType=staff_collection. Accepts the same filters as the list endpoint.
   *     parameters:
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *       - in: query
   *         name: itemId
   *         schema: { type: string }
   *       - in: query
   *         name: staffId
   *         schema: { type: string }
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
   *       200: { description: Summary rows (sorted by category, subCategory, brand, item name) }
   */
  getStaffCollectionSummary: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
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

      const result = await staffCollectionService.summarizeStaffCollectionsByItem({
        q,
        itemId,
        staffId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
      });
      return res.json({ success: true, message: "Staff collection summary retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve staff collection summary", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-collections/{id}:
   *   get:
   *     summary: Get a staff collection transaction by ID
   *     tags: [StaffCollections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Staff collection details }
   *       404: { description: Staff collection not found }
   *   put:
   *     summary: Update a staff collection transaction
   *     tags: [StaffCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Updates allowed fields only. transactionType stays staff_collection. status stays completed. sessionId/termId refresh from active period.
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
   *               staffId: { type: string, nullable: true }
   *               qtyOut: { oneOf: [{ type: string }, { type: number }] }
   *               outCost: { oneOf: [{ type: string }, { type: number }] }
   *               referenceNo: { type: string, nullable: true }
   *               notes: { type: string, nullable: true }
   *               transactionDate: { type: string, format: date-time }
   *     responses:
   *       200: { description: Staff collection updated }
   *       404: { description: Staff collection/item/staff not found }
   *   delete:
   *     summary: Delete a staff collection transaction
   *     tags: [StaffCollections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Staff collection deleted }
   *       404: { description: Staff collection not found }
   */
  getStaffCollectionById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await staffCollectionService.getStaffCollectionById(id);
      if (!row) return res.status(404).json({ success: false, message: "Staff collection not found" });
      return res.json({ success: true, message: "Staff collection retrieved successfully", data: row });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve staff collection", error: error?.message });
    }
  },

  updateStaffCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { itemId, staffId, qtyOut, outCost, referenceNo, notes, transactionDate } = req.body ?? {};
      if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
        return res.status(400).json({ success: false, message: "itemId must be a non-empty string" });
      }
      if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string or null" });
      }
      if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
        return res.status(400).json({ success: false, message: "qtyOut must be a string or number" });
      }
      if (qtyOut !== undefined) {
        const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
        if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
          return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
        }
      }
      if (outCost !== undefined && !isNumberOrString(outCost)) {
        return res.status(400).json({ success: false, message: "outCost must be a string or number" });
      }
      if (outCost !== undefined) {
        const outCostNum = typeof outCost === "string" ? Number(outCost) : outCost;
        if (!Number.isFinite(outCostNum) || outCostNum < 0) {
          return res.status(400).json({ success: false, message: "outCost must be >= 0" });
        }
      }
      if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (notes !== undefined && !isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }

      const updated = await staffCollectionService.updateStaffCollection(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(staffId !== undefined ? { staffId: staffId === null ? null : staffId.trim() } : {}),
        ...(qtyOut !== undefined ? { qtyOut } : {}),
        ...(outCost !== undefined ? { outCost } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(transactionDate !== undefined ? { transactionDate: new Date(transactionDate) } : {}),
      });

      return res.json({ success: true, message: "Staff collection updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update staff collection";
      const code = message === "Staff collection not found" || message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteStaffCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await staffCollectionService.deleteStaffCollection(id);
      return res.json({ success: true, message: "Staff collection deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete staff collection";
      const code = message === "Staff collection not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};

