import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import { studentCollectionService } from "../services/studentCollectionService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function httpStatusForStudentCollectionCreate(message: string): number {
  if (message.startsWith("Invalid ")) return 404;
  if (message.includes("not authorized to issue items")) return 403;
  return 500;
}

/**
 * @openapi
 * /api/v1/student-collections:
 *   post:
 *     summary: Create a student inventory collection transaction
 *     tags: [StudentCollections]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates an InventoryTransaction with transactionType=student_collection (locked). Status defaults to completed.
 *       classId/subclassId derived from studentId; sessionId/termId from active period; referenceNo auto-generated if missing.
 *       storeId optional — must be a store you manage; if omitted, the first store you manage (by name) is used.
 *       If you manage no store, the request is rejected (403).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, studentId, qtyOut]
 *             properties:
 *               itemId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               qtyOut:
 *                 oneOf: [{ type: string }, { type: number }]
 *               storeId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. Must be a store where you are the manager. If omitted, first managed store is used.
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
 *     responses:
 *       201:
 *         description: Student collection created
 *       400:
 *         description: Validation error
 *       403:
 *         description: User is not a store manager or cannot issue from the chosen store
 *       404:
 *         description: Referenced item, student, or store not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List student collection transactions
 *     tags: [StudentCollections]
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
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional filter by class ID
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *         description: Optional filter by subclass ID
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
 *         description: Student collections list
 *       500:
 *         description: Server error
 */
export const studentCollectionController = {
  /**
   * @openapi
   * /api/v1/student-collections/bulk:
   *   put:
   *     summary: Update multiple student collection transactions (bulk)
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Updates allowed fields only. transactionType stays student_collection. status stays completed. Each updated row refreshes sessionId/termId from active period.
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
   *                     itemId:
   *                       type: string
   *                     studentId:
   *                       type: string
   *                     qtyOut:
   *                       oneOf: [{ type: string }, { type: number }]
   *                     referenceNo:
   *                       type: string
   *                       nullable: true
   *                     notes:
   *                       type: string
   *                       nullable: true
   *                     transactionDate:
   *                       type: string
   *                       format: date-time
   *     responses:
   *       200:
   *         description: Student collections updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Student collection/item/student not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete multiple student collection transactions (bulk)
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Deletes multiple InventoryTransaction rows (transactionType must be student_collection).
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
   *     responses:
   *       200:
   *         description: Student collections deleted
   *       400:
   *         description: Validation error
   *       404:
   *         description: Student collection not found
   *       500:
   *         description: Server error
   */
  updateBulkStudentCollections: async (req: Request, res: Response) => {
    try {
      const { updates } = req.body ?? {};

      if (!Array.isArray(updates) || updates.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "updates is required and must be a non-empty array" });
      }

      const normalizedUpdates: Array<{
        id: string;
        itemId?: string;
        studentId?: string;
        qtyOut?: string | number;
        referenceNo?: string | null;
        notes?: string | null;
        transactionDate?: Date;
      }> = [];

      for (const [idx, u] of updates.entries()) {
        if (!u || typeof u !== "object") {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}] must be an object` });
        }
        const { id, itemId, studentId, qtyOut, referenceNo, notes, transactionDate } = u as any;
        if (!id || typeof id !== "string" || !id.trim()) {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}].id is required` });
        }
        if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}].itemId must be a non-empty string` });
        }
        if (studentId !== undefined && (typeof studentId !== "string" || !studentId.trim())) {
          return res
            .status(400)
            .json({
              success: false,
              message: `updates[${idx}].studentId must be a non-empty string`,
            });
        }
        if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}].qtyOut must be a string or number` });
        }
        if (qtyOut !== undefined) {
          const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
          if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
            return res
              .status(400)
              .json({ success: false, message: `updates[${idx}].qtyOut must be greater than 0` });
          }
        }
        if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
          return res
            .status(400)
            .json({
              success: false,
              message: `updates[${idx}].referenceNo must be a string or null`,
            });
        }
        if (notes !== undefined && !isStringOrNullOrUndefined(notes)) {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}].notes must be a string or null` });
        }
        if (transactionDate !== undefined && typeof transactionDate !== "string") {
          return res
            .status(400)
            .json({
              success: false,
              message: `updates[${idx}].transactionDate must be an ISO date string`,
            });
        }
        const parsedDate =
          transactionDate === undefined
            ? undefined
            : (() => {
                const d = new Date(transactionDate);
                return Number.isNaN(d.getTime()) ? null : d;
              })();
        if (parsedDate === null) {
          return res
            .status(400)
            .json({ success: false, message: `updates[${idx}].transactionDate is invalid` });
        }

        normalizedUpdates.push({
          id: id.trim(),
          ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
          ...(studentId !== undefined ? { studentId: studentId.trim() } : {}),
          ...(qtyOut !== undefined ? { qtyOut } : {}),
          ...(referenceNo !== undefined ? { referenceNo } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const updated = await studentCollectionService.updateBulkStudentCollections({
        updates: normalizedUpdates,
      });
      return res.json({
        success: true,
        message: "Student collections updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update student collections";
      const code =
        message.startsWith("Invalid ") || message.startsWith("Student collection not found")
          ? 404
          : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteBulkStudentCollections: async (req: Request, res: Response) => {
    try {
      const { ids } = req.body ?? {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "ids is required and must be a non-empty array" });
      }
      for (const [idx, id] of ids.entries()) {
        if (!id || typeof id !== "string" || !id.trim()) {
          return res
            .status(400)
            .json({ success: false, message: `ids[${idx}] must be a non-empty string` });
        }
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const deleted = await studentCollectionService.deleteBulkStudentCollections({
        ids: ids.map((s: string) => s.trim()),
      });
      return res.json({
        success: true,
        message: "Student collections deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete student collections";
      const code = message.startsWith("Student collection not found") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/student-collections/summary:
   *   get:
   *     summary: Summary of student-collected items (grouped by item)
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Returns sum(qtyOut) grouped by itemId for transactions with transactionType=student_collection. Accepts the same filters as the list endpoint.
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *       - in: query
   *         name: itemId
   *         schema:
   *           type: string
   *       - in: query
   *         name: studentId
   *         schema:
   *           type: string
   *       - in: query
   *         name: classId
   *         schema:
   *           type: string
   *       - in: query
   *         name: subclassId
   *         schema:
   *           type: string
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
   *     responses:
   *       200:
 *         description: Summary rows (sorted by category, subCategory, brand, item name)
   *       400:
   *         description: Validation error
   *       500:
   *         description: Server error
   */
  /**
   * @openapi
   * /api/v1/student-collections/report/items-received:
   *   post:
   *     summary: Quantities received per student for selected items
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns one row per Active student (optionally filtered by class/subClass on the student record),
   *       with qtyReceived per requested item — sum(qtyOut) on completed student_collection transactions.
   *       Optional query filters also apply to transaction sessionId, termId, classId, and subclassId.
   *     parameters:
   *       - in: query
   *         name: classId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: subclassId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: sessionId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: termId
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [itemIds]
   *             properties:
   *               itemIds:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: string
   *                   format: uuid
   *     responses:
   *       200:
   *         description: Array of studentInfo + items with qtyReceived
   *       400:
   *         description: Validation error
   *       500:
   *         description: Server error
   */
  getStudentItemsReceivedReport: async (req: Request, res: Response) => {
    try {
      const { itemIds } = req.body ?? {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ success: false, message: "itemIds must be a non-empty array" });
      }
      if (!itemIds.every((id) => typeof id === "string" && id.trim())) {
        return res.status(400).json({
          success: false,
          message: "Each itemIds entry must be a non-empty string",
        });
      }

      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subclassId = typeof req.query.subclassId === "string" ? req.query.subclassId : undefined;
      const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const termId = typeof req.query.termId === "string" ? req.query.termId : undefined;

      const data = await studentCollectionService.getStudentItemsReceivedReport({
        itemIds,
        classId,
        subclassId,
        sessionId,
        termId,
      });

      return res.json({
        success: true,
        message: "Student items received report retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve report";
      const status =
        message === "itemIds must not be empty" ||
        message.includes("itemIds must") ||
        message.includes("Invalid itemId")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  getStudentCollectionSummary: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subclassId = typeof req.query.subclassId === "string" ? req.query.subclassId : undefined;
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
      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }
      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;
      if (
        transactionDateFrom !== undefined &&
        transactionDateTo !== undefined &&
        transactionDateFrom.getTime() > transactionDateTo.getTime()
      ) {
        return res.status(400).json({
          success: false,
          message: "transactionDateFrom must be before or equal to transactionDateTo",
        });
      }

      const result = await studentCollectionService.summarizeStudentCollectionsByItem({
        q,
        itemId,
        studentId,
        classId,
        subclassId,
        sessionId,
        termId,
        status,
        transactionDateFrom,
        transactionDateTo,
      });

      return res.json({ success: true, message: "Student collection summary retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student collection summary",
        error: error?.message,
      });
    }
  },
  /**
   * @openapi
   * /api/v1/student-collections/bulk:
   *   post:
   *     summary: Create multiple student collection transactions (bulk)
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Creates multiple InventoryTransaction rows with transactionType=student_collection (locked).
   *       Shared studentId, storeId (optional; defaults to first managed store), referenceNo, notes, transactionDate.
   *       Only items[].itemId and items[].qtyOut vary. Issuer must manage a store unless storeId resolves from assignment.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studentId, items]
   *             properties:
   *               studentId:
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
   *                 description: Optional. Defaults to today.
   *               storeId:
   *                 type: string
   *                 format: uuid
   *                 description: Optional. Store you manage; if omitted, first managed store is used.
   *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [itemId, qtyOut]
 *                   properties:
 *                     itemId:
 *                       type: string
 *                     qtyOut:
 *                       oneOf: [{ type: string }, { type: number }]
 *     responses:
 *       201:
 *         description: Student collections created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Not a store manager or cannot issue from chosen store
 *       404:
 *         description: Referenced item/student/store not found
 *       500:
 *         description: Server error
   */
  createBulkStudentCollections: async (req: Request, res: Response) => {
    try {
      const { studentId, referenceNo, notes, transactionDate, items, storeId } = req.body ?? {};

      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || !storeId.trim())) {
        return res.status(400).json({ success: false, message: "storeId must be a non-empty string or null" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res
          .status(400)
          .json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "transactionDate must be an ISO date string" });
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
        return res
          .status(400)
          .json({ success: false, message: "items is required and must be a non-empty array" });
      }

      const normalizedItems: Array<{ itemId: string; qtyOut: string | number }> = [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qtyOut } = it as any;
        if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].itemId is required` });
        }
        if (!isNumberOrString(qtyOut)) {
          return res.status(400).json({
            success: false,
            message: `items[${idx}].qtyOut is required (string or number)`,
          });
        }
        const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
        if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].qtyOut must be greater than 0` });
        }
        normalizedItems.push({ itemId: itemId.trim(), qtyOut });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await studentCollectionService.createBulkStudentCollections({
        studentId: studentId.trim(),
        referenceNo: referenceNo === undefined ? null : referenceNo,
        notes: notes === undefined ? null : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
        items: normalizedItems,
      });

      return res.status(201).json({
        success: true,
        message: "Student collections created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create student collections";
      return res.status(httpStatusForStudentCollectionCreate(message)).json({ success: false, message });
    }
  },

  createStudentCollection: async (req: Request, res: Response) => {
    try {
      const { itemId, studentId, qtyOut, referenceNo, notes, transactionDate, storeId } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || !storeId.trim())) {
        return res.status(400).json({ success: false, message: "storeId must be a non-empty string or null" });
      }
      if (!isNumberOrString(qtyOut)) {
        return res
          .status(400)
          .json({ success: false, message: "qtyOut is required (string or number)" });
      }
      const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
      if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
        return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res
          .status(400)
          .json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "transactionDate must be an ISO date string" });
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

      const created = await studentCollectionService.createStudentCollection({
        itemId: itemId.trim(),
        studentId: studentId.trim(),
        qtyOut,
        referenceNo:
          referenceNo === undefined || referenceNo === null || referenceNo.trim() === ""
            ? null
            : referenceNo,
        notes: notes === undefined || notes === null || notes.trim() === "" ? null : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
        storeId: storeId === undefined ? undefined : storeId === null ? null : storeId.trim(),
      });

      return res.status(201).json({
        success: true,
        message: "Student collection created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create student collection";
      return res.status(httpStatusForStudentCollectionCreate(message)).json({ success: false, message });
    }
  },

  listStudentCollections: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subclassId =
        typeof req.query.subclassId === "string" ? req.query.subclassId : undefined;
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

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      if (
        transactionDateFrom !== undefined &&
        transactionDateTo !== undefined &&
        transactionDateFrom.getTime() > transactionDateTo.getTime()
      ) {
        return res.status(400).json({
          success: false,
          message: "transactionDateFrom must be before or equal to transactionDateTo",
        });
      }

      const result = await studentCollectionService.listStudentCollections({
        q,
        itemId,
        studentId,
        classId,
        subclassId,
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
        message: "Student collections retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student collections",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/student-collections/{id}:
   *   get:
   *     summary: Get a student collection transaction by ID
   *     tags: [StudentCollections]
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
   *         description: Student collection details
   *       404:
   *         description: Student collection not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a student collection transaction
   *     tags: [StudentCollections]
   *     security:
   *       - bearerAuth: []
   *     description: Updates allowed fields only. transactionType stays student_collection. status stays completed. sessionId/termId refresh from active period.
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
   *               itemId:
   *                 type: string
   *               studentId:
   *                 type: string
   *               qtyOut:
   *                 oneOf: [{ type: string }, { type: number }]
   *               referenceNo:
   *                 type: string
   *                 nullable: true
   *               notes:
   *                 type: string
   *                 nullable: true
   *               transactionDate:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Student collection updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Student collection/item/student not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a student collection transaction
   *     tags: [StudentCollections]
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
   *         description: Student collection deleted
   *       404:
   *         description: Student collection not found
   *       500:
   *         description: Server error
   */
  getStudentCollectionById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await studentCollectionService.getStudentCollectionById(id);
      if (!row)
        return res.status(404).json({ success: false, message: "Student collection not found" });

      return res.json({
        success: true,
        message: "Student collection retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student collection",
        error: error?.message,
      });
    }
  },

  updateStudentCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const { itemId, studentId, qtyOut, referenceNo, notes, transactionDate } = req.body ?? {};

      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "itemId must be a non-empty string" });
      }
      if (studentId !== undefined && (typeof studentId !== "string" || !studentId.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "studentId must be a non-empty string" });
      }
      if (qtyOut !== undefined && !isNumberOrString(qtyOut)) {
        return res
          .status(400)
          .json({ success: false, message: "qtyOut must be a string or number" });
      }
      if (qtyOut !== undefined) {
        const qtyOutNum = typeof qtyOut === "string" ? Number(qtyOut) : qtyOut;
        if (!Number.isFinite(qtyOutNum) || qtyOutNum <= 0) {
          return res.status(400).json({ success: false, message: "qtyOut must be greater than 0" });
        }
      }
      if (referenceNo !== undefined && !isStringOrNullOrUndefined(referenceNo)) {
        return res
          .status(400)
          .json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (notes !== undefined && !isStringOrNullOrUndefined(notes)) {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "transactionDate must be an ISO date string" });
      }

      const updated = await studentCollectionService.updateStudentCollection(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(studentId !== undefined ? { studentId: studentId.trim() } : {}),
        ...(qtyOut !== undefined ? { qtyOut } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(transactionDate !== undefined ? { transactionDate: new Date(transactionDate) } : {}),
      });

      return res.json({
        success: true,
        message: "Student collection updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update student collection";
      const code =
        message === "Student collection not found" || message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteStudentCollection: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await studentCollectionService.deleteStudentCollection(id);
      return res.json({
        success: true,
        message: "Student collection deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete student collection";
      const code = message === "Student collection not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
