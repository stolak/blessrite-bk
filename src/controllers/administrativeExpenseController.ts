import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { administrativeExpenseService } from "../services/administrativeExpenseService";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";
import { isNumberOrString, isStringOrNullOrUndefined, routeParam } from "../utils/request";

function parseStatusQuery(raw: unknown): Status | "All" | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "All") return "All";
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

function parseBodyStatus(raw: unknown): Status | undefined {
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

function parseBodyTransactionDate(raw: unknown): Date | "invalid" | "missing" {
  const parsed = parseQueryDateStart(raw);
  if (parsed === "missing") return "missing";
  if (parsed === "invalid") return "invalid";
  return parsed;
}

function parseBodyAmount(raw: unknown): string | number | "invalid" | "missing" {
  if (raw === undefined) return "missing";
  if (!isNumberOrString(raw)) return "invalid";
  if (typeof raw === "string" && !raw.trim()) return "invalid";
  return raw;
}

/**
 * @openapi
 * /api/v1/administrative-expenses:
 *   post:
 *     summary: Create an administrative expense
 *     tags: [AdministrativeExpenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [administrativeExpenseComponentId, amount, transactionDate]
 *             properties:
 *               administrativeExpenseComponentId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 oneOf: [{ type: string }, { type: number }]
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: YYYY-MM-DD or ISO date-time
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               remarks:
 *                 type: string
 *                 nullable: true
 *               referenceNo:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Expense created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Component not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List administrative expenses
 *     tags: [AdministrativeExpenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search referenceNo and remarks (substring)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *       - in: query
 *         name: administrativeExpenseComponentId
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
 *     responses:
 *       200:
 *         description: Expenses list
 *       400:
 *         description: Invalid query
 *       500:
 *         description: Server error
 */
export const administrativeExpenseController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        administrativeExpenseComponentId,
        amount,
        transactionDate,
        status,
        remarks,
        referenceNo,
      } = req.body ?? {};

      if (
        !administrativeExpenseComponentId ||
        typeof administrativeExpenseComponentId !== "string" ||
        !administrativeExpenseComponentId.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "administrativeExpenseComponentId is required",
        });
      }

      const parsedAmount = parseBodyAmount(amount);
      if (parsedAmount === "missing" || parsedAmount === "invalid") {
        return res.status(400).json({ success: false, message: "amount is required and must be valid" });
      }

      const parsedDateRaw = parseBodyTransactionDate(transactionDate);
      if (parsedDateRaw === "missing") {
        return res.status(400).json({ success: false, message: "transactionDate is required" });
      }
      if (parsedDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDate is invalid" });
      }
      const transactionDateValue = parsedDateRaw;

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      if (!isStringOrNullOrUndefined(remarks)) {
        return res.status(400).json({ success: false, message: "remarks must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }

      const createdById = getAuthenticatedUserId(req);

      const created = await administrativeExpenseService.create({
        administrativeExpenseComponentId: administrativeExpenseComponentId.trim(),
        amount: parsedAmount,
        transactionDate: transactionDateValue,
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(remarks !== undefined ? { remarks } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(createdById ? { createdById } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Administrative expense created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create administrative expense";
      if (message.includes("component not found") || message.includes("Invalid administrativeExpenseComponentId")) {
        return res.status(404).json({ success: false, message });
      }
      if (
        message.includes("required") ||
        message.includes("amount must") ||
        message.includes("is invalid")
      ) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);
      const administrativeExpenseComponentId =
        typeof req.query.administrativeExpenseComponentId === "string"
          ? req.query.administrativeExpenseComponentId.trim() || undefined
          : undefined;

      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
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

      const result = await administrativeExpenseService.list({
        q,
        status,
        administrativeExpenseComponentId,
        transactionDateFrom,
        transactionDateTo,
      });

      return res.json({
        success: true,
        message: "Administrative expenses retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve administrative expenses";
      if (message.includes("transactionDateFrom")) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve administrative expenses",
        error: message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/administrative-expenses/{id}:
   *   get:
   *     summary: Get an administrative expense by ID
   *     tags: [AdministrativeExpenses]
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
   *         description: Expense details
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update an administrative expense
   *     tags: [AdministrativeExpenses]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
 *             properties:
 *               administrativeExpenseComponentId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 oneOf: [{ type: string }, { type: number }]
 *               transactionDate:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               remarks:
 *                 type: string
 *                 nullable: true
 *               referenceNo:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *   delete:
   *     summary: Delete an administrative expense
   *     tags: [AdministrativeExpenses]
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
   *         description: Deleted
   *       404:
   *         description: Not found
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const row = await administrativeExpenseService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Administrative expense not found" });
      }

      return res.json({
        success: true,
        message: "Administrative expense retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve administrative expense",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const {
        administrativeExpenseComponentId,
        amount,
        transactionDate,
        status,
        remarks,
        referenceNo,
      } = req.body ?? {};

      if (
        administrativeExpenseComponentId !== undefined &&
        (typeof administrativeExpenseComponentId !== "string" ||
          !administrativeExpenseComponentId.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "administrativeExpenseComponentId cannot be empty",
        });
      }

      let parsedAmount: string | number | undefined;
      if (amount !== undefined) {
        const a = parseBodyAmount(amount);
        if (a === "missing" || a === "invalid") {
          return res.status(400).json({ success: false, message: "amount must be valid" });
        }
        parsedAmount = a;
      }

      let parsedDate: Date | undefined;
      if (transactionDate !== undefined) {
        const d = parseBodyTransactionDate(transactionDate);
        if (d === "missing" || d === "invalid") {
          return res.status(400).json({ success: false, message: "transactionDate is invalid" });
        }
        parsedDate = d;
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      if (!isStringOrNullOrUndefined(remarks)) {
        return res.status(400).json({ success: false, message: "remarks must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(referenceNo)) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string or null" });
      }

      const updatedById = getAuthenticatedUserId(req);

      const updated = await administrativeExpenseService.update(id, {
        ...(administrativeExpenseComponentId !== undefined
          ? { administrativeExpenseComponentId: administrativeExpenseComponentId.trim() }
          : {}),
        ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
        ...(parsedDate !== undefined ? { transactionDate: parsedDate } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(remarks !== undefined ? { remarks } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(updatedById ? { updatedById } : {}),
      });

      return res.json({
        success: true,
        message: "Administrative expense updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update administrative expense";
      if (message.includes("not found") || message.includes("component not found")) {
        return res.status(404).json({ success: false, message });
      }
      if (
        message.includes("cannot be empty") ||
        message.includes("amount must") ||
        message.includes("is invalid")
      ) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const deleted = await administrativeExpenseService.delete(id);

      return res.json({
        success: true,
        message: "Administrative expense deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete administrative expense";
      if (message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },
};
