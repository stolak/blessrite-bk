import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import { projectCollectionService } from "../services/projectCollectionService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function httpStatusForProjectCollectionCreate(message: string): number {
  if (message.startsWith("Invalid ")) return 404;
  if (message.includes("not authorized to issue items")) return 403;
  return 500;
}

/**
 * @openapi
 * /api/v1/project-collections:
 *   post:
 *     summary: Create a single project collection transaction
 *     tags: [ProjectCollections]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates one InventoryTransaction with transactionType=project_collection (locked).
 *       Status is completed. sessionId/termId come from the active period.
 *       referenceNo is auto-generated (PCOL-YYYYMMDD-xxxxxxxx) if omitted or empty.
 *       notes is required. projectId must exist. staffId and hostelId are optional; when provided they must exist.
 *       storeId optional — must be a store you manage; if omitted, the first store you manage (by name) is used. If you manage no store, the request is rejected (403).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, qtyOut, notes, projectId]
 *             properties:
 *               itemId:
 *                 type: string
 *                 format: uuid
 *               qtyOut:
 *                 description: Quantity out (must be > 0)
 *                 oneOf: [{ type: string }, { type: number }]
 *               notes:
 *                 type: string
 *                 minLength: 1
 *               projectId:
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
 *                 description: Defaults to now if omitted
 *               storeId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. Must be a store you manage; defaults to first managed store by name.
 *     responses:
 *       201:
 *         description: Project collection created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 *       403:
 *         description: Issuer is not allowed to issue from store(s)
 *       404:
 *         description: Invalid itemId, projectId, staffId, hostelId, or storeId
 *       500:
 *         description: Server error
 *   get:
 *     summary: List project collection transactions
 *     tags: [ProjectCollections]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Returns transactions with transactionType=project_collection only.
 *       Response data includes projectCollections array and pagination (page, limit, total, totalPages).
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Optional search in referenceNo and notes (substring match)
 *       - in: query
 *         name: itemId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: projectId
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
 *         description: Inclusive start (date only; interpreted as start of day per server)
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *         description: Inclusive end (date only)
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
 *         description: Invalid query parameter (e.g. status or date range)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const projectCollectionController = {
  /**
   * @openapi
   * /api/v1/project-collections/bulk:
   *   post:
   *     summary: Create multiple project collection transactions (bulk)
   *     tags: [ProjectCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Creates multiple rows with transactionType=project_collection.
 *       Shared notes, projectId, optional staffId/hostelId/referenceNo/transactionDate/storeId across all rows.
 *       Each items[] entry supplies itemId and qtyOut. notes and projectId are required. storeId follows single-create rules.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [notes, projectId, items]
   *             properties:
   *               notes:
   *                 type: string
   *                 minLength: 1
   *               projectId:
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
 *         description: Project collections created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Issuer is not allowed to issue from store(s)
 *       404:
 *         description: Invalid itemId(s), projectId, staffId, hostelId, or storeId
 *       500:
 *         description: Server error
 */
  createBulkProjectCollections: async (req: Request, res: Response) => {
    try {
      const { referenceNo, notes, transactionDate, items, projectId, staffId, hostelId, storeId } = req.body ?? {};

      if (notes === undefined || notes === null || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ success: false, message: "notes is required and must be a non-empty string" });
      }
      if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
        return res.status(400).json({ success: false, message: "projectId is required" });
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

      const created = await projectCollectionService.createBulkProjectCollections({
        notes: notes.trim(),
        projectId: projectId.trim(),
        staffId: staffId === undefined ? undefined : staffId === null ? null : staffId.trim(),
        hostelId: hostelId === undefined ? undefined : hostelId === null ? null : hostelId.trim(),
        referenceNo: referenceNo === undefined ? null : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
        items: normalizedItems,
      });

      return res.status(201).json({ success: true, message: "Project collections created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create project collections";
      return res.status(httpStatusForProjectCollectionCreate(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/project-collections/bulk:
   *   put:
   *     summary: Update multiple project collection transactions (bulk)
   *     tags: [ProjectCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Updates only rows with transactionType=project_collection.
   *       sessionId/termId are refreshed from the active period for each updated row.
   *       Empty notes string is rejected. referenceNo null clears; empty string triggers auto-generation.
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
   *                     id:
   *                       type: string
   *                       format: uuid
   *                     itemId:
   *                       type: string
   *                       format: uuid
   *                     qtyOut:
   *                       oneOf: [{ type: string }, { type: number }]
   *                     referenceNo:
   *                       type: string
   *                       nullable: true
   *                     notes:
   *                       type: string
   *                     projectId:
   *                       type: string
   *                       format: uuid
   *                     staffId:
   *                       type: string
   *                       format: uuid
   *                       nullable: true
   *                     hostelId:
   *                       type: string
   *                       format: uuid
   *                       nullable: true
   *                     transactionDate:
   *                       type: string
   *                       format: date-time
   *     responses:
   *       200:
   *         description: Updated transactions
   *       400:
   *         description: Validation error or empty notes
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Project collection not found or invalid foreign key
   *       500:
   *         description: Server error
   */
  updateBulkProjectCollections: async (req: Request, res: Response) => {
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
        projectId?: string;
        staffId?: string | null;
        hostelId?: string | null;
        transactionDate?: Date;
      }> = [];

      for (const [idx, u] of updates.entries()) {
        if (!u || typeof u !== "object") {
          return res.status(400).json({ success: false, message: `updates[${idx}] must be an object` });
        }
        const { id, itemId, qtyOut, referenceNo, notes, projectId, staffId, hostelId, transactionDate } = u as Record<string, unknown>;
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
        if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim())) {
          return res.status(400).json({ success: false, message: `updates[${idx}].projectId must be a non-empty string` });
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
          ...(projectId !== undefined ? { projectId: (projectId as string).trim() } : {}),
          ...(staffId !== undefined ? { staffId: staffId === null ? null : (staffId as string).trim() } : {}),
          ...(hostelId !== undefined ? { hostelId: hostelId === null ? null : (hostelId as string).trim() } : {}),
          ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        });
      }

      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await projectCollectionService.updateBulkProjectCollections({ updates: normalizedUpdates });
      return res.json({ success: true, message: "Project collections updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update project collections";
      const status =
        message === "notes cannot be empty"
          ? 400
          : message.startsWith("Invalid ") || message.startsWith("Project collection not found")
            ? 404
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/project-collections/bulk:
   *   delete:
   *     summary: Delete multiple project collection transactions (bulk)
   *     tags: [ProjectCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Deletes only rows with transactionType=project_collection and the given ids.
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
   *                 items:
   *                   type: string
   *                   format: uuid
   *     responses:
   *       200:
   *         description: Deleted transactions (returned in data)
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: One or more ids not found or wrong type
   *       500:
   *         description: Server error
   */
  deleteBulkProjectCollections: async (req: Request, res: Response) => {
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
      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await projectCollectionService.deleteBulkProjectCollections({ ids: ids.map((s: string) => s.trim()) });
      return res.json({ success: true, message: "Project collections deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete project collections";
      const code = message.startsWith("Project collection not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  createProjectCollection: async (req: Request, res: Response) => {
    try {
      const { itemId, qtyOut, referenceNo, notes, transactionDate, projectId, staffId, hostelId, storeId } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
        return res.status(400).json({ success: false, message: "projectId is required" });
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

      const created = await projectCollectionService.createProjectCollection({
        itemId: itemId.trim(),
        qtyOut,
        notes: notes.trim(),
        projectId: projectId.trim(),
        staffId: staffId === undefined ? undefined : staffId === null ? null : staffId.trim(),
        hostelId: hostelId === undefined ? undefined : hostelId === null ? null : hostelId.trim(),
        referenceNo: referenceNo === undefined ? undefined : referenceNo,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
      });

      return res.status(201).json({ success: true, message: "Project collection created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create project collection";
      return res.status(httpStatusForProjectCollectionCreate(message)).json({ success: false, message });
    }
  },

  listProjectCollections: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
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

      const result = await projectCollectionService.listProjectCollections({
        q,
        itemId,
        projectId,
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
      return res.json({ success: true, message: "Project collections retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve project collections",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/project-collections/summary:
   *   get:
   *     summary: Summary of project collection quantities by item
   *     tags: [ProjectCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns sum(qtyOut) grouped by itemId for transactionType=project_collection.
   *       Items include category, subCategory, and brand for display; rows are sorted by category, subCategory, brand, then item name.
   *       Accepts the same filters as the list endpoint (q, itemId, projectId, staffId, hostelId, sessionId, termId, status, transactionDateFrom, transactionDateTo).
   *     parameters:
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *       - in: query
   *         name: itemId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: projectId
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
   *     responses:
   *       200:
   *         description: summary array with itemId, totalQtyOut (string), and nested item details
   *       400:
   *         description: Invalid filter or date range
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getProjectCollectionSummary: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
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

      const result = await projectCollectionService.summarizeProjectCollectionsByItem({
        q,
        itemId,
        projectId,
        staffId,
        hostelId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
      });
      return res.json({ success: true, message: "Project collection summary retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve project collection summary",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/project-collections/{id}:
   *   get:
   *     summary: Get a project collection transaction by ID
   *     tags: [ProjectCollections]
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
   *         description: Transaction with item, createdBy, project, staff, hostel
   *       400:
   *         description: Missing id
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found or not a project_collection transaction
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a project collection transaction
   *     tags: [ProjectCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       transactionType remains project_collection; status remains completed.
   *       sessionId/termId refresh from active period. All body fields optional except validations apply when present.
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
   *               itemId:
   *                 type: string
   *                 format: uuid
   *               qtyOut:
   *                 oneOf: [{ type: string }, { type: number }]
   *               referenceNo:
   *                 type: string
   *                 nullable: true
   *               notes:
   *                 type: string
   *               projectId:
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
   *               transactionDate:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Updated transaction
   *       400:
   *         description: Validation error or empty notes
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found or invalid foreign key
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a project collection transaction
   *     tags: [ProjectCollections]
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
   *         description: Deleted transaction returned in data
   *       400:
   *         description: Missing id
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getProjectCollectionById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await projectCollectionService.getProjectCollectionById(id);
      if (!row) return res.status(404).json({ success: false, message: "Project collection not found" });
      return res.json({ success: true, message: "Project collection retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve project collection",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateProjectCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { itemId, qtyOut, referenceNo, notes, transactionDate, projectId, staffId, hostelId } = req.body ?? {};

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
      if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim())) {
        return res.status(400).json({ success: false, message: "projectId must be a non-empty string" });
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

      const updated = await projectCollectionService.updateProjectCollection(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(qtyOut !== undefined ? { qtyOut } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(projectId !== undefined ? { projectId: projectId.trim() } : {}),
        ...(staffId !== undefined ? { staffId: staffId === null ? null : staffId.trim() } : {}),
        ...(hostelId !== undefined ? { hostelId: hostelId === null ? null : hostelId.trim() } : {}),
        ...(parsedTxDate !== undefined ? { transactionDate: parsedTxDate } : {}),
      });

      return res.json({ success: true, message: "Project collection updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update project collection";
      const code =
        message === "Project collection not found" || message.startsWith("Invalid ") ? 404 : message === "notes cannot be empty" ? 400 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteProjectCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await projectCollectionService.deleteProjectCollection(id);
      return res.json({ success: true, message: "Project collection deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete project collection";
      const code = message === "Project collection not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
