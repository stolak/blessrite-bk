import { Request, Response } from "express";
import { InventoryTransactionStatus } from "@prisma/client";
import {
  InsufficientStoreTransferError,
  storeTransferService,
} from "../services/storeTransferService";
import { isNumberOrString, parseIntOrUndefined } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function httpStatusForStoreTransfer(message: string): number {
  if (message.startsWith("Invalid ")) return 404;
  if (message.includes("not authorized to transfer")) return 403;
  return 500;
}

/**
 * @openapi
 * /api/v1/store-transfers:
 *   post:
 *     summary: Transfer inventory quantities from one store to another
 *     tags: [StoreTransfers]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates paired InventoryTransaction rows with transactionType=store_transfer: qtyOut at sourceStoreId and qtyIn at destStoreId per item.
 *       Availability at the source is computed as sum(qtyIn) − sum(qtyOut) for completed transactions for that store and item.
 *       All lines are validated inside a DB transaction with FOR UPDATE locks on both stores; nothing is inserted if any line is insufficient.
 *       The authenticated user must be the assigned manager of both stores.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceStoreId, destStoreId, items]
 *             properties:
 *               sourceStoreId:
 *                 type: string
 *                 format: uuid
 *               destStoreId:
 *                 type: string
 *                 format: uuid
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [itemId, qty]
 *                   properties:
 *                     itemId:
 *                       type: string
 *                       format: uuid
 *                     qty:
 *                       description: Quantity to transfer (must be > 0). Duplicate itemIds are combined.
 *                       oneOf: [{ type: string }, { type: number }]
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
 *       201:
 *         description: Transfer recorded (two rows per distinct item)
 *       400:
 *         description: |
 *           Validation error or insufficient quantity at source. When stock is insufficient, `data` includes
 *           `sourceStore`, `evaluatedAt` (snapshot time inside the DB transaction), and `insufficient[]` with per-item
 *           `available`, `requested`, and `shortfall`.
 *       403:
 *         description: User is not manager of source or destination store
 *       404:
 *         description: Invalid store or item id
 *       500:
 *         description: Server error
 *   get:
 *     summary: List store transfer lines (paired source → destination per item)
 *     tags: [StoreTransfers]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Returns logical transfer lines: quantity moved from `sourceStore` to `destStore` for each item, with
 *       `outTransactionId` / `inTransactionId` for the two `store_transfer` rows.
 *       Optional `sourceStoreId` filters the outbound leg; `destStoreId` alone filters the inbound leg; if both are set,
 *       only pairs matching that source and destination store are returned.
 *       Optional `status` filters by transaction status (`pending`, `cancelled`, `deleted`, `completed`); omit to include all.
 *     parameters:
 *       - in: query
 *         name: sourceStoreId
 *         schema: { type: string, format: uuid }
 *         description: Filter by source store (out leg)
 *       - in: query
 *         name: destStoreId
 *         schema: { type: string, format: uuid }
 *         description: Filter by destination store (in leg)
 *       - in: query
 *         name: itemId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, cancelled, deleted, completed]
 *         description: Filter by leg status (outbound leg; paired inbound has the same status)
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search in referenceNo and notes (out leg)
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
 *         description: Paginated `transfers` lines and `pagination`
 *       400:
 *         description: Invalid date range
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const storeTransferController = {
  listStoreTransfers: async (req: Request, res: Response) => {
    try {
      const sourceStoreId =
        typeof req.query.sourceStoreId === "string" && req.query.sourceStoreId.trim()
          ? req.query.sourceStoreId.trim()
          : undefined;
      const destStoreId =
        typeof req.query.destStoreId === "string" && req.query.destStoreId.trim()
          ? req.query.destStoreId.trim()
          : undefined;
      const itemId =
        typeof req.query.itemId === "string" && req.query.itemId.trim()
          ? req.query.itemId.trim()
          : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;

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

      const data = await storeTransferService.listStoreTransfers({
        sourceStoreId,
        destStoreId,
        itemId,
        status,
        q,
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });
      return res.json({ success: true, message: "Store transfers retrieved successfully", data });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to list store transfers",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  transfer: async (req: Request, res: Response) => {
    try {
      const { sourceStoreId, destStoreId, items, referenceNo, notes, transactionDate } = req.body ?? {};

      if (!sourceStoreId || typeof sourceStoreId !== "string" || !sourceStoreId.trim()) {
        return res.status(400).json({ success: false, message: "sourceStoreId is required" });
      }
      if (!destStoreId || typeof destStoreId !== "string" || !destStoreId.trim()) {
        return res.status(400).json({ success: false, message: "destStoreId is required" });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "items is required and must be a non-empty array" });
      }

      if (referenceNo !== undefined && referenceNo !== null && typeof referenceNo !== "string") {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }
      if (notes !== undefined && notes !== null && typeof notes !== "string") {
        return res.status(400).json({ success: false, message: "notes must be a string or null" });
      }
      if (transactionDate !== undefined && typeof transactionDate !== "string") {
        return res.status(400).json({ success: false, message: "transactionDate must be an ISO date string" });
      }

      const normalizedItems: Array<{ itemId: string; qty: string | number }> = [];
      for (const [idx, row] of items.entries()) {
        if (!row || typeof row !== "object") {
          return res.status(400).json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { itemId, qty } = row as Record<string, unknown>;
        if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
          return res.status(400).json({ success: false, message: `items[${idx}].itemId is required` });
        }
        if (!isNumberOrString(qty)) {
          return res.status(400).json({
            success: false,
            message: `items[${idx}].qty is required (string or number)`,
          });
        }
        normalizedItems.push({ itemId: itemId.trim(), qty });
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

      const result = await storeTransferService.transferBetweenStores({
        sourceStoreId,
        destStoreId,
        items: normalizedItems,
        referenceNo: referenceNo === undefined ? undefined : referenceNo,
        notes: notes === undefined ? undefined : notes,
        transactionDate: parsedDate ?? undefined,
        createdById,
      });

      return res.status(201).json({
        success: true,
        message: "Store transfer completed successfully",
        data: result,
      });
    } catch (error: unknown) {
      if (error instanceof InsufficientStoreTransferError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: {
            ...error.snapshot,
            insufficient: error.details,
          },
        });
      }
      const message = error instanceof Error ? error.message : "Failed to transfer between stores";
      if (
        message === "sourceStoreId and destStoreId must be different" ||
        message === "items must not be a non-empty array" ||
        message.startsWith("Each item quantity must be")
      ) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(httpStatusForStoreTransfer(message)).json({ success: false, message });
    }
  },
};
