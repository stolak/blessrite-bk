import { Request, Response } from "express";
import { salesService } from "../services/salesService";
import { isNumberOrString, isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function normalizeOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function httpStatusForSalesError(message: string): number {
  if (
    message === "Invalid storeId" ||
    message.startsWith("Invalid itemId") ||
    message.includes("not a cashier") ||
    message.includes("does not have a ledger") ||
    message.includes("ledger is not active") ||
    message.includes("account not found") ||
    message.includes("Default account settings not found")
  ) {
    return 404;
  }
  if (message.includes("Only one of staffId or stundentId")) {
    return 400;
  }
  return 500;
}

function assertExclusiveStaffOrStudent(body: Record<string, unknown>): string | null {
  const hasStaffKey = Object.prototype.hasOwnProperty.call(body, "staffId");
  const hasStudentKey = Object.prototype.hasOwnProperty.call(body, "stundentId");
  if (!hasStaffKey || !hasStudentKey) return null;
  const staffVal = normalizeOptionalString(body.staffId);
  const studentVal = normalizeOptionalString(body.stundentId);
  if (staffVal && studentVal) {
    return "Only one of staffId or stundentId may be provided in the request, not both";
  }
  return null;
}

/**
 * @openapi
 * /api/v1/sales/bulk:
 *   post:
 *     summary: Create a sales transaction (multiple line items)
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Creates InventoryTransaction rows with transactionType=sales (locked) and status=completed (locked).
 *       Each item line records qtyOut and outCost from qty and amount. All lines share the same reference, store, customer, and date.
 *       Posts ledger entries: sale total debited to cashier ledger by default, or to STAFF_ACCOUNT / STUDENT_ACCOUNT when staffId or stundentId is provided (only one of those two, not both).
 *       Requires the authenticated user to be an active cashier with a ledger account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, items]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *                 description: Store where stock is sold from (applied to every line)
 *               ref:
 *                 type: string
 *                 nullable: true
 *                 description: Sales reference number. Auto-generated when omitted or empty.
 *               note:
 *                 type: string
 *                 nullable: true
 *               customerName:
 *                 type: string
 *                 nullable: true
 *               staffId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Optional. When set, sale receipt is debited to the STAFF_ACCOUNT default ledger instead of the cashier ledger. Must not be sent together with stundentId.
 *               stundentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Optional student id. When set, sale receipt is debited to the STUDENT_ACCOUNT default ledger instead of the cashier ledger. Must not be sent together with staffId.
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Optional. Defaults to now.
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [id, qty, amount]
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Inventory item id
 *                     qty:
 *                       oneOf: [{ type: string }, { type: number }]
 *                       description: Quantity sold (qtyOut)
 *                     amount:
 *                       oneOf: [{ type: string }, { type: number }]
 *                       description: Line sale amount (outCost)
 *     responses:
 *       201:
 *         description: Sales transactions created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Store, item, cashier, or default account not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List sales transactions (grouped by reference)
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: Grouped sales list
 *       500:
 *         description: Server error
 */
export const salesController = {
  createBulkSales: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const exclusiveError = assertExclusiveStaffOrStudent(body);
      if (exclusiveError) {
        return res.status(400).json({ success: false, message: exclusiveError });
      }

      const { storeId, ref, note, customerName, transactionDate, staffId, stundentId, items } =
        body;

      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }

      if (!isStringOrNullOrUndefined(ref)) {
        return res.status(400).json({ success: false, message: "ref must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(note)) {
        return res.status(400).json({ success: false, message: "note must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(customerName)) {
        return res
          .status(400)
          .json({ success: false, message: "customerName must be a string or null" });
      }

      const normalizedStaffId = normalizeOptionalString(staffId);
      if (staffId !== undefined && normalizedStaffId === undefined) {
        return res.status(400).json({ success: false, message: "staffId must be a string or null" });
      }
      const normalizedStundentId = normalizeOptionalString(stundentId);
      if (stundentId !== undefined && normalizedStundentId === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "stundentId must be a string or null" });
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

      const normalizedItems: Array<{ itemId: string; qty: string | number; amount: string | number }> =
        [];
      for (const [idx, it] of items.entries()) {
        if (!it || typeof it !== "object") {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}] must be an object` });
        }
        const { id, qty, amount } = it as { id?: unknown; qty?: unknown; amount?: unknown };
        if (!id || typeof id !== "string" || !id.trim()) {
          return res.status(400).json({ success: false, message: `items[${idx}].id is required` });
        }
        if (!isNumberOrString(qty)) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].qty is required (string or number)` });
        }
        const qtyNum = typeof qty === "string" ? Number(qty) : qty;
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          return res
            .status(400)
            .json({ success: false, message: `items[${idx}].qty must be greater than 0` });
        }
        if (!isNumberOrString(amount)) {
          return res.status(400).json({
            success: false,
            message: `items[${idx}].amount is required (string or number)`,
          });
        }
        const amountNum = typeof amount === "string" ? Number(amount) : amount;
        if (!Number.isFinite(amountNum) || amountNum < 0) {
          return res.status(400).json({
            success: false,
            message: `items[${idx}].amount must be zero or greater`,
          });
        }

        normalizedItems.push({ itemId: id.trim(), qty, amount });
      }

      const createdById = (req as { user?: { id: string } }).user?.id;
      if (!createdById) return res.status(401).json({ success: false, message: "Unauthorized" });

      const created = await salesService.createBulkSales({
        storeId: storeId.trim(),
        referenceNo: ref === undefined ? null : (ref as string | null),
        notes: note === undefined ? null : (note as string | null),
        customerName: customerName === undefined ? null : (customerName as string | null),
        transactionDate: parsedDate ?? undefined,
        ...(normalizedStaffId !== undefined ? { staffId: normalizedStaffId } : {}),
        ...(normalizedStundentId !== undefined ? { stundentId: normalizedStundentId } : {}),
        createdById,
        items: normalizedItems,
      });

      return res.status(201).json({
        success: true,
        message: "Sales created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create sales";
      return res.status(httpStatusForSalesError(message)).json({ success: false, message });
    }
  },

  listGroupedSales: async (req: Request, res: Response) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
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
      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await salesService.listGroupedSales({
        ...(storeId !== undefined && storeId.trim() !== "" ? { storeId: storeId.trim() } : {}),
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Grouped sales retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve grouped sales",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/sales:
   *   get:
   *     summary: List sales transaction lines
   *     tags: [Sales]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *         description: Search reference, note, or customer name
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
   *         name: customerName
   *         schema:
   *           type: string
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
   *         description: Sales lines list
   *       500:
   *         description: Server error
   */
  listSales: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
      const customerName =
        typeof req.query.customerName === "string" ? req.query.customerName : undefined;
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
      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await salesService.listSales({
        q,
        ...(itemId !== undefined && itemId.trim() !== "" ? { itemId: itemId.trim() } : {}),
        ...(storeId !== undefined && storeId.trim() !== "" ? { storeId: storeId.trim() } : {}),
        ...(customerName !== undefined && customerName.trim() !== ""
          ? { customerName: customerName.trim() }
          : {}),
        transactionDateFrom,
        transactionDateTo,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Sales retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sales",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/sales/{id}:
   *   get:
   *     summary: Get a sales transaction line by ID
   *     tags: [Sales]
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
   *         description: Sales line details
   *       404:
   *         description: Sale not found
   *       500:
   *         description: Server error
   */
  getSaleById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await salesService.getSaleById(id);
      if (!row) return res.status(404).json({ success: false, message: "Sale not found" });

      return res.json({ success: true, message: "Sale retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve sale",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },
};
