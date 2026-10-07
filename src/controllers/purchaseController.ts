import { Request, Response } from "express";
import { purchaseService } from "../services/purchaseService";
import { InventoryTransactionStatus } from "@prisma/client";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

/**
 * @openapi
 * /api/v1/purchases:
 *   post:
 *     summary: Create a purchase transaction
 *     tags: [Purchases]
 *     security:
 *       - bearerAuth: []
 *     description: Creates an InventoryTransaction with transactionType=purchase (locked). Defaults status to completed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, qtyIn, storeId]
 *             properties:
 *               itemId:
 *                 type: string
 *               storeId:
 *                 type: string
 *                 format: uuid
 *                 description: Store receiving the stock (required)
 *               supplierId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. Empty string "" is treated as null.
 *               qtyIn:
 *                 oneOf: [{ type: string }, { type: number }]
 *               inCost:
 *                 oneOf: [{ type: string }, { type: number }]
 *                 description: Optional. If provided must be > 0.
 *               amountPaid:
 *                 oneOf: [{ type: string }, { type: number }]
 *                 description: Optional. If provided must be > 0.
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
 *               status:
 *                 type: string
 *                 enum: [pending, cancelled, deleted, completed]
 *                 description: Optional override (defaults to completed)
 *     responses:
 *       201:
 *         description: Purchase created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Referenced item/supplier/store not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List purchase transactions
 *     tags: [Purchases]
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
 *         name: supplierId
 *         schema:
 *           type: string
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional filter by store id
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
 *         description: Inclusive lower bound on transactionDate. Use YYYY-MM-DD (whole UTC day) or a full ISO-8601 datetime.
 *       - in: query
 *         name: transactionDateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive upper bound on transactionDate. Use YYYY-MM-DD (whole UTC day, end 23:59:59.999Z) or a full ISO-8601 datetime.
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
 *         description: Purchases list
 *       500:
 *         description: Server error
 */
export const purchaseController = {
  /**
   * @openapi
   * /api/v1/purchases/grouped:
   *   get:
   *     summary: List purchases grouped by referenceNo
   *     tags: [Purchases]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: supplierId
   *         schema: { type: string }
   *       - in: query
   *         name: storeId
   *         schema: { type: string, format: uuid }
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
   *         description: Grouped purchases list
   *       400:
   *         description: Invalid date range
   *       500:
   *         description: Server error
   */
  listGroupedPurchases: async (req: Request, res: Response) => {
    try {
      const supplierId =
        typeof req.query.supplierId === "string" && req.query.supplierId.trim()
          ? req.query.supplierId.trim()
          : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;
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

      const result = await purchaseService.listGroupedPurchases({
        supplierId,
        storeId,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({
        success: true,
        message: "Group Purchases retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to retrieve grouped purchases", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/purchases/bulk:
   *   post:
   *     summary: Create multiple purchase transactions (bulk)
   *     tags: [Purchases]
   *     security:
   *       - bearerAuth: []
   *     description: Creates multiple InventoryTransaction rows with transactionType=purchase (locked). Defaults status to completed.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [items, storeId]
   *             properties:
   *               storeId:
   *                 type: string
   *                 format: uuid
   *                 description: Store receiving the stock (required; applied to every line)
   *               supplierId:
   *                 type: string
   *                 nullable: true
   *                 description: Optional. Empty string "" is treated as null.
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
   *               amountPaid:
   *                 oneOf: [{ type: string }, { type: number }]
   *                 description: Optional payment amount (>= 0). Applied to each created row. When greater than zero, paymentAccountId is required and ledger payment entries are posted.
   *               paymentAccountId:
   *                 type: string
   *                 nullable: true
   *                 description: Chart of accounts id (AccountChart.id) for the cash/bank account used to pay the supplier. Required when amountPaid is greater than zero. Empty string "" is treated as null.
   *               status:
   *                 type: string
   *                 enum: [pending, cancelled, deleted, completed]
   *                 description: Optional override (defaults to completed)
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [itemId, qtyIn, inCost]
   *                   properties:
   *                     itemId:
   *                       type: string
   *                     qtyIn:
   *                       oneOf: [{ type: string }, { type: number }]
   *                     inCost:
   *                       oneOf: [{ type: string }, { type: number }]
   *     responses:
   *       201:
   *         description: Purchases created
   *       400:
   *         description: Validation error
   *       404:
   *         description: Referenced item/supplier/store/payment account not found
   *       500:
   *         description: Server error
   */
  createBulkPurchases: async (req: Request, res: Response) => {
    try {
      const {
        storeId,
        supplierId,
        referenceNo,
        notes,
        transactionDate,
        amountPaid,
        paymentAccountId,
        status,
        items,
      } = req.body ?? {};

      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }

      if (!isStringOrNullOrUndefined(supplierId)) {
        return res
          .status(400)
          .json({ success: false, message: "supplierId must be a string or null" });
      }
      const normalizedSupplierId =
        supplierId === undefined || supplierId === null
          ? null
          : supplierId.trim().length > 0
            ? supplierId.trim()
            : null;

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

      if (amountPaid !== undefined && !isNumberOrString(amountPaid)) {
        return res
          .status(400)
          .json({ success: false, message: "amountPaid must be a string or number" });
      }
      let amountPaidNum = 0;
      if (amountPaid !== undefined) {
        amountPaidNum = typeof amountPaid === "string" ? Number(amountPaid) : amountPaid;
        if (!Number.isFinite(amountPaidNum) || amountPaidNum < 0) {
          return res
            .status(400)
            .json({ success: false, message: "amountPaid must be zero or greater" });
        }
      }

      if (!isStringOrNullOrUndefined(paymentAccountId)) {
        return res
          .status(400)
          .json({ success: false, message: "paymentAccountId must be a string or null" });
      }
      const normalizedPaymentAccountId =
        paymentAccountId === undefined || paymentAccountId === null
          ? null
          : String(paymentAccountId).trim().length > 0
            ? String(paymentAccountId).trim()
            : null;
      if (normalizedPaymentAccountId !== null) {
        const paymentAccountIdNum = Number(normalizedPaymentAccountId);
        if (!Number.isFinite(paymentAccountIdNum) || paymentAccountIdNum < 1) {
          return res
            .status(400)
            .json({ success: false, message: "paymentAccountId must be a positive integer" });
        }
      }
      if (amountPaidNum > 0 && !normalizedPaymentAccountId) {
        return res.status(400).json({
          success: false,
          message: "paymentAccountId is required when amountPaid is greater than zero",
        });
      }

      if (
        status !== undefined &&
        status !== InventoryTransactionStatus.pending &&
        status !== InventoryTransactionStatus.cancelled &&
        status !== InventoryTransactionStatus.deleted &&
        status !== InventoryTransactionStatus.completed
      ) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "items is required and must be a non-empty array" });
      }

      const normalizedItems: Array<{
        itemId: string;
        qtyIn: string | number;
        inCost: string | number;
      }> = [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qtyIn, inCost } = it;
        if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].itemId is required` });
        }
        if (!isNumberOrString(qtyIn)) {
          return res
            .status(400)
            .json({
              success: false,
              message: `items[${idx}].qtyIn is required (string or number)`,
            });
        }
        const qtyInNum = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
        if (!Number.isFinite(qtyInNum) || qtyInNum <= 0) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].qtyIn must be greater than 0` });
        }
        if (!isNumberOrString(inCost)) {
          return res
            .status(400)
            .json({
              success: false,
              message: `items[${idx}].inCost is required (string or number)`,
            });
        }
        const inCostNum = typeof inCost === "string" ? Number(inCost) : inCost;
        if (!Number.isFinite(inCostNum) || inCostNum < 0) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].inCost must be greater than 0` });
        }

        normalizedItems.push({ itemId: itemId.trim(), qtyIn, inCost });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await purchaseService.createBulkPurchases({
        storeId: storeId.trim(),
        supplierId: normalizedSupplierId,
        referenceNo: referenceNo === undefined ? null : referenceNo,
        notes: notes === undefined ? null : notes,
        transactionDate: parsedDate ?? undefined,
        ...(amountPaid !== undefined ? { amountPaid } : {}),
        ...(paymentAccountId !== undefined
          ? { paymentAccountId: normalizedPaymentAccountId }
          : {}),
        status,
        createdById,
        items: normalizedItems,
      });

      return res
        .status(201)
        .json({ success: true, message: "Purchases created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create purchases";
      const code = message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  createPurchase: async (req: Request, res: Response) => {
    try {
      const {
        itemId,
        storeId,
        supplierId,
        qtyIn,
        inCost,
        amountPaid,
        referenceNo,
        notes,
        transactionDate,
        status,
      } = req.body ?? {};

      if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }
      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }
      if (!isStringOrNullOrUndefined(supplierId)) {
        return res
          .status(400)
          .json({ success: false, message: "supplierId must be a string or null" });
      }
      const normalizedSupplierId =
        supplierId === undefined || supplierId === null
          ? null
          : supplierId.trim().length > 0
            ? supplierId.trim()
            : null;

      if (!isNumberOrString(qtyIn)) {
        return res
          .status(400)
          .json({ success: false, message: "qtyIn is required (string or number)" });
      }
      const qtyInNum = typeof qtyIn === "string" ? Number(qtyIn) : qtyIn;
      if (!Number.isFinite(qtyInNum) || qtyInNum <= 0) {
        return res.status(400).json({ success: false, message: "qtyIn must be greater than 0" });
      }

      if (inCost !== undefined && !isNumberOrString(inCost)) {
        return res
          .status(400)
          .json({ success: false, message: "inCost must be a string or number" });
      }
      if (inCost !== undefined) {
        const inCostNum = typeof inCost === "string" ? Number(inCost) : inCost;
        if (!Number.isFinite(inCostNum) || inCostNum < 0) {
          return res.status(400).json({ success: false, message: "inCost must be greater than 0" });
        }
      }

      if (amountPaid !== undefined && !isNumberOrString(amountPaid)) {
        return res
          .status(400)
          .json({ success: false, message: "amountPaid must be a string or number" });
      }
      if (amountPaid !== undefined) {
        const amountPaidNum = typeof amountPaid === "string" ? Number(amountPaid) : amountPaid;
        if (!Number.isFinite(amountPaidNum) || amountPaidNum < 0) {
          return res
            .status(400)
            .json({ success: false, message: "amountPaid must be greater than 0" });
        }
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
      if (
        status !== undefined &&
        status !== InventoryTransactionStatus.pending &&
        status !== InventoryTransactionStatus.cancelled &&
        status !== InventoryTransactionStatus.deleted &&
        status !== InventoryTransactionStatus.completed
      ) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await purchaseService.createPurchase({
        itemId: itemId.trim(),
        storeId: storeId.trim(),
        supplierId: normalizedSupplierId,
        qtyIn,
        ...(inCost !== undefined && (typeof inCost !== "string" || inCost.trim() !== "") ? { inCost } : {}),
        ...(amountPaid !== undefined && (typeof amountPaid !== "string" || amountPaid.trim() !== "")
          ? { amountPaid }
          : {}),
        referenceNo:
          referenceNo === undefined || referenceNo === null || referenceNo.trim() === ""
            ? null
            : referenceNo,
        notes: notes === undefined || notes === null || notes.trim() === "" ? null : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
        status,
      });

      return res
        .status(201)
        .json({ success: true, message: "Purchase created successfully", data: created });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create purchase";
      const code = message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listPurchases: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const supplierId =
        typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;
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
        return res
          .status(400)
          .json({ success: false, message: "transactionDateFrom is invalid" });
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

      const result = await purchaseService.listPurchases({
        q,
        itemId,
        supplierId,
        storeId,
        status,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({ success: true, message: "Purchases retrieved successfully", data: result });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to retrieve purchases", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/purchases/{id}:
   *   get:
   *     summary: Get a purchase transaction by ID
   *     tags: [Purchases]
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
   *         description: Purchase details
   *       404:
   *         description: Purchase not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a purchase transaction
   *     tags: [Purchases]
   *     security:
   *       - bearerAuth: []
   *     description: Updates allowed fields only. transactionType stays purchase.
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
   *               supplierId:
   *                 type: string
   *                 nullable: true
   *               qtyIn:
   *                 oneOf: [{ type: string }, { type: number }]
   *               inCost:
   *                 oneOf: [{ type: string }, { type: number }]
   *               amountPaid:
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
   *               status:
   *                 type: string
   *                 enum: [pending, cancelled, deleted, completed]
   *     responses:
   *       200:
   *         description: Purchase updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Purchase/item/supplier not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a purchase transaction
   *     tags: [Purchases]
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
   *         description: Purchase deleted
   *       404:
   *         description: Purchase not found
   *       500:
   *         description: Server error
   */
  getPurchaseById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const purchase = await purchaseService.getPurchaseById(id);
      if (!purchase) return res.status(404).json({ success: false, message: "Purchase not found" });

      return res.json({
        success: true,
        message: "Purchase retrieved successfully",
        data: purchase,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to retrieve purchase", error: error?.message });
    }
  },

  updatePurchase: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const {
        itemId,
        supplierId,
        qtyIn,
        inCost,
        amountPaid,
        referenceNo,
        notes,
        transactionDate,
        status,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "itemId must be a non-empty string" });
      }
      if (supplierId !== undefined && !isStringOrNullOrUndefined(supplierId)) {
        return res
          .status(400)
          .json({ success: false, message: "supplierId must be a string or null" });
      }
      if (qtyIn !== undefined && !isNumberOrString(qtyIn)) {
        return res
          .status(400)
          .json({ success: false, message: "qtyIn must be a string or number" });
      }
      if (inCost !== undefined && !isNumberOrString(inCost)) {
        return res
          .status(400)
          .json({ success: false, message: "inCost must be a string or number" });
      }
      if (amountPaid !== undefined && !isNumberOrString(amountPaid)) {
        return res
          .status(400)
          .json({ success: false, message: "amountPaid must be a string or number" });
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
      if (
        status !== undefined &&
        status !== InventoryTransactionStatus.pending &&
        status !== InventoryTransactionStatus.cancelled &&
        status !== InventoryTransactionStatus.deleted &&
        status !== InventoryTransactionStatus.completed
      ) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const updated = await purchaseService.updatePurchase(id, {
        ...(itemId !== undefined ? { itemId: itemId.trim() } : {}),
        ...(supplierId !== undefined ? { supplierId } : {}),
        ...(qtyIn !== undefined ? { qtyIn } : {}),
        ...(inCost !== undefined ? { inCost } : {}),
        ...(amountPaid !== undefined ? { amountPaid } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(transactionDate !== undefined ? { transactionDate: new Date(transactionDate) } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Purchase updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update purchase";
      const code = message === "Purchase not found" || message.startsWith("Invalid ") ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deletePurchase: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await purchaseService.deletePurchase(id);
      return res.json({ success: true, message: "Purchase deleted successfully", data: deleted });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete purchase";
      const code = message === "Purchase not found" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
