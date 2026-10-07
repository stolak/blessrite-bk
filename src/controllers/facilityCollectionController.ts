import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import { facilityCollectionService } from "../services/facilityCollectionService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function httpStatusForFacilityCollectionCreate(message: string): number {
  if (message.startsWith("Invalid ")) return 404;
  if (message.includes("not authorized to issue items")) return 403;
  return 500;
}

/**
 * @openapi
 * /api/v1/facility-collections:
 *   post:
 *     summary: Create a single facility collection transaction
 *     tags: [FacilityCollections]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates one InventoryTransaction with transactionType=facility_collection (locked).
 *       Status is completed. sessionId/termId come from the active period.
 *       referenceNo is auto-generated (FCOL-YYYYMMDD-xxxxxxxx) if omitted or empty.
 *       notes is required. facilityId must exist. staffId and hostelId are optional; when provided they must exist.
 *       storeId optional — must be a store you manage; if omitted, the first store you manage (by name) is used.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, qtyOut, notes, facilityId]
 *             properties:
 *               itemId:
 *                 type: string
 *                 format: uuid
 *               qtyOut:
 *                 oneOf: [{ type: string }, { type: number }]
 *               notes:
 *                 type: string
 *                 minLength: 1
 *               facilityId:
 *                 type: string
 *                 format: uuid
 *               staffId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               hostelId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               referenceNo:
 *                 type: string
 *                 nullable: true
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *               storeId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Facility collection created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Issuer is not allowed to issue from store(s)
 *       404:
 *         description: Invalid itemId, facilityId, staffId, hostelId, or storeId
 *       500:
 *         description: Server error
 *   get:
 *     summary: List facility collection transactions
 *     tags: [FacilityCollections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: itemId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: facilityId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: staffId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: hostelId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sessionId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: termId
 *         schema: { type: string, format: uuid }
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
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list
 *       400:
 *         description: Invalid query parameter
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const facilityCollectionController = {
  /**
   * @openapi
   * /api/v1/facility-collections/bulk:
   *   post:
   *     summary: Create multiple facility collection transactions (bulk)
   *     tags: [FacilityCollections]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [notes, facilityId, items]
   *             properties:
   *               notes:
   *                 type: string
   *               facilityId:
   *                 type: string
   *                 format: uuid
   *               staffId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *               hostelId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *               referenceNo:
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
   *                     itemId:
   *                       type: string
   *                       format: uuid
   *                     qtyOut:
   *                       oneOf: [{ type: string }, { type: number }]
   *     responses:
   *       201:
   *         description: Facility collections created
   */
  createBulkFacilityCollections: async (req: Request, res: Response) => {
    try {
      const { referenceNo, notes, transactionDate, items, facilityId, staffId, hostelId, storeId } = req.body ?? {};

      if (notes === undefined || notes === null || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ success: false, message: "notes is required and must be a non-empty string" });
      }
      if (!facilityId || typeof facilityId !== "string" || !facilityId.trim()) {
        return res.status(400).json({ success: false, message: "facilityId is required" });
      }
      if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string or null" });
      }
      if (hostelId !== undefined && hostelId !== null && (typeof hostelId !== "string" || !hostelId.trim())) {
        return res.status(400).json({ success: false, message: "hostelId must be a non-empty string or null" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
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

      const normalizedItems: Array<{ itemId: string; qtyOut: string | number }> = [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res.status(400).json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qtyOut } = it as Record<string, unknown>;
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
        normalizedItems.push({ itemId: itemId.trim(), qtyOut });
      }

      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await facilityCollectionService.createBulkFacilityCollections({
        notes: notes.trim(),
        facilityId: facilityId.trim(),
        staffId: staffId === undefined ? undefined : staffId === null ? null : staffId.trim(),
        hostelId: hostelId === undefined ? undefined : hostelId === null ? null : hostelId.trim(),
        referenceNo: referenceNo === undefined ? null : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
        items: normalizedItems,
      });

      return res.status(201).json({ success: true, message: "Facility collections created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create facility collections";
      return res.status(httpStatusForFacilityCollectionCreate(message)).json({ success: false, message });
    }
  },

  createFacilityCollection: async (req: Request, res: Response) => {
    try {
      const { itemId, qtyOut, referenceNo, notes, transactionDate, facilityId, staffId, hostelId, storeId } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!facilityId || typeof facilityId !== "string" || !facilityId.trim()) {
        return res.status(400).json({ success: false, message: "facilityId is required" });
      }
      if (!isNumberOrString(qtyOut)) {
        return res.status(400).json({ success: false, message: "qtyOut is required (string or number)" });
      }
      const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
      if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
        return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
      }
      if (notes === undefined || notes === null || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ success: false, message: "notes is required and must be a non-empty string" });
      }
      if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string or null" });
      }
      if (hostelId !== undefined && hostelId !== null && (typeof hostelId !== "string" || !hostelId.trim())) {
        return res.status(400).json({ success: false, message: "hostelId must be a non-empty string or null" });
      }
      if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || !storeId.trim())) {
        return res.status(400).json({ success: false, message: "storeId must be a non-empty string or null" });
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

      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await facilityCollectionService.createFacilityCollection({
        itemId: itemId.trim(),
        qtyOut,
        notes: notes.trim(),
        facilityId: facilityId.trim(),
        staffId: staffId === undefined ? undefined : staffId === null ? null : staffId.trim(),
        hostelId: hostelId === undefined ? undefined : hostelId === null ? null : hostelId.trim(),
        referenceNo: referenceNo === undefined ? undefined : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
      });

      return res.status(201).json({ success: true, message: "Facility collection created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create facility collection";
      return res.status(httpStatusForFacilityCollectionCreate(message)).json({ success: false, message });
    }
  },

  listFacilityCollections: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
      const hostelId = typeof req.query.hostelId === "string" ? req.query.hostelId : undefined;
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

      const result = await facilityCollectionService.listFacilityCollections({
        q,
        itemId,
        facilityId,
        staffId,
        hostelId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({ success: true, message: "Facility collections retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve facility collections",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  getFacilityCollectionSummary: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
      const hostelId = typeof req.query.hostelId === "string" ? req.query.hostelId : undefined;
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

      const result = await facilityCollectionService.summarizeFacilityCollectionsByItem({
        q,
        itemId,
        facilityId,
        staffId,
        hostelId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
      });
      return res.json({ success: true, message: "Facility collection summary retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve facility collection summary",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  getFacilityCollectionById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await facilityCollectionService.getFacilityCollectionById(id);
      if (!row) return res.status(404).json({ success: false, message: "Facility collection not found" });
      return res.json({ success: true, message: "Facility collection retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve facility collection",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateFacilityCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { itemId, qtyOut, referenceNo, notes, transactionDate, facilityId, staffId, hostelId } = req.body ?? {};

      if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
        return res.status(400).json({ success: false, message: "itemId must be a non-empty string" });
      }
      if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
        return res.status(400).json({ success: false, message: "qtyOut must be a string or number" });
      }
      if (qtyOut !== undefined) {
        const n = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
        }
      }
      if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (notes !== undefined && (typeof notes !== "string" || !notes.trim())) {
        return res.status(400).json({ success: false, message: "notes must be a non-empty string if provided" });
      }
      if (facilityId !== undefined && (typeof facilityId !== "string" || !facilityId.trim())) {
        return res.status(400).json({ success: false, message: "facilityId must be a non-empty string" });
      }
      if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string or null" });
      }
      if (hostelId !== undefined && hostelId !== null && (typeof hostelId !== "string" || !hostelId.trim())) {
        return res.status(400).json({ success: false, message: "hostelId must be a non-empty string or null" });
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

      const updated = await facilityCollectionService.updateFacilityCollection(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(qtyOut !== undefined ? { qtyOut } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(facilityId !== undefined ? { facilityId: facilityId.trim() } : {}),
        ...(staffId !== undefined ? { staffId: staffId === null ? null : staffId.trim() } : {}),
        ...(hostelId !== undefined ? { hostelId: hostelId === null ? null : hostelId.trim() } : {}),
        ...(parsedTxDate !== undefined ? { transactionDate: parsedTxDate } : {}),
      });

      return res.json({ success: true, message: "Facility collection updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update facility collection";
      const code =
        message === "Facility collection not found" || message.startsWith("Invalid ") ? 404 : message === "notes cannot be empty" ? 400 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  updateBulkFacilityCollections: async (req: Request, res: Response) => {
    try {
      const { updates } = req.body ?? {};
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, message: "updates is required and must be a non-empty array" });
      }

      const normalizedUpdates: Array<{
        id: string;
        itemId?: string;
        qtyOut?: string | number;
        referenceNo?: string | null;
        notes?: string;
        facilityId?: string;
        staffId?: string | null;
        hostelId?: string | null;
        transactionDate?: Date;
      }> = [];

      for (const [idx, u] of updates.entries()) {
        if (!u || typeof u !== "object") {
          return res.status(400).json({ success: false, message: `updates[${idx}] must be an object` });
        }
        const { id, itemId, qtyOut, referenceNo, notes, facilityId, staffId, hostelId, transactionDate } = u as Record<string, unknown>;
        if (!id || typeof id !== "string" || !id.trim()) {
          return res.status(400).json({ success: false, message: `updates[${idx}].id is required` });
        }
        if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].itemId must be a non-empty string` });
        }
        if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].qtyOut must be a string or number` });
        }
        if (qtyOut !== undefined) {
          const n = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
          if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ success: false, message: `updates[${idx}].qtyOut must be greater than 0` });
          }
        }
        if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
          return res.status(400).json({ success: false, message: `updates[${idx}].referenceNo must be a string or null` });
        }
        if (notes !== undefined && (typeof notes !== "string" || !notes.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].notes must be a non-empty string if provided` });
        }
        if (facilityId !== undefined && (typeof facilityId !== "string" || !facilityId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].facilityId must be a non-empty string` });
        }
        if (staffId !== undefined && staffId !== null && (typeof staffId !== "string" || !staffId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].staffId must be a non-empty string or null` });
        }
        if (hostelId !== undefined && hostelId !== null && (typeof hostelId !== "string" || !hostelId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].hostelId must be a non-empty string or null` });
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
          ...(qtyOut !== undefined ? { qtyOut } : {}),
          ...(referenceNo !== undefined ? { referenceNo: referenceNo as string | null } : {}),
          ...(notes !== undefined ? { notes: (notes as string).trim() } : {}),
          ...(facilityId !== undefined ? { facilityId: (facilityId as string).trim() } : {}),
          ...(staffId !== undefined ? { staffId: staffId === null ? null : (staffId as string).trim() } : {}),
          ...(hostelId !== undefined ? { hostelId: hostelId === null ? null : (hostelId as string).trim() } : {}),
          ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        });
      }

      const updated = await facilityCollectionService.updateBulkFacilityCollections({ updates: normalizedUpdates });
      return res.json({ success: true, message: "Facility collections updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update facility collections";
      const status =
        message === "notes cannot be empty"
          ? 400
          : message.startsWith("Invalid ") || message.startsWith("Facility collection not found")
            ? 404
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  deleteFacilityCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await facilityCollectionService.deleteFacilityCollection(id);
      return res.json({ success: true, message: "Facility collection deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete facility collection";
      const code = message === "Facility collection not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteBulkFacilityCollections: async (req: Request, res: Response) => {
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

      const deleted = await facilityCollectionService.deleteBulkFacilityCollections({ ids: ids.map((s: string) => s.trim()) });
      return res.json({ success: true, message: "Facility collections deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete facility collections";
      const code = message.startsWith("Facility collection not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
