import { Request, Response } from "express";
import { parseIntOrUndefined } from "../utils/request";
import { classDefaultBillingService } from "../services/classDefaultBillingService";
import { getAuthenticatedUserId } from "../middlewares/auth";

function parseNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : undefined;
  }
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asTrimmedString(v: unknown): string | undefined {
  if (typeof v !== "string") {
    return undefined;
  }
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asStringOrNullOrUndefined(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return v;
}

/**
 * @openapi
 * /api/v1/class-default-billings:
 *   post:
 *     summary: Create class default billing
 *     tags: [ClassDefaultBillings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, session, term, billingId, amount]
 *             properties:
 *               classId: { type: string, example: 4e6ddae5-9d2f-4c0a-a723-f6be5ec36f14 }
 *               subclassId: { type: string, nullable: true, example: 6b9a9a53-bb6c-4d67-ae7f-ee35dfeb043a }
 *               session: { type: string, example: 2025-2026 }
 *               term: { type: string, example: First-Term }
 *               billingId: { type: integer, example: 1 }
 *               amount: { type: number, example: 50000 }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: Billing item not found }
 *       500: { description: Server error }
 *   get:
 *     summary: List class default billings
 *     tags: [ClassDefaultBillings]
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: subclassId
 *         schema: { type: string }
 *       - in: query
 *         name: session
 *         schema: { type: string }
 *       - in: query
 *         name: term
 *         schema: { type: string }
 *       - in: query
 *         name: billingId
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: List }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/class-default-billings/bulk:
 *   post:
 *     summary: Bulk add class default billings
 *     description: Creates multiple entries for a class/session/term using multiple billingId and amount pairs.
 *     tags: [ClassDefaultBillings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, session, term, items]
 *             properties:
 *               classId: { type: string }
 *               subclassId: { type: string, nullable: true }
 *               session: { type: string }
 *               term: { type: string }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [billingId, amount]
 *                   properties:
 *                     billingId: { type: integer, minimum: 1 }
 *                     amount: { type: number, minimum: 0 }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: One or more billing items not found }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/class-default-billings/apply-to-students:
 *   post:
 *     summary: Apply class default billings to matching students
 *     description: |
 *       Loads class default billings for sessionId + termId + classId (and optional subclassId),
 *       then creates or updates DRAFT student billings for all matching students.
 *       Existing APPROVED student billing items for the same student/billing/session/term are skipped.
 *     tags: [ClassDefaultBillings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, termId, classId]
 *             properties:
 *               sessionId: { type: string }
 *               termId: { type: string }
 *               classId: { type: string }
 *               subclassId: { type: string }
 *     responses:
 *       200: { description: Applied }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       404: { description: Defaults or related records not found }
 *       500: { description: Server error }
 */
export const classDefaultBillingController = {
  create: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};

      const classId = asTrimmedString(body.classId);
      const session = asTrimmedString(body.session);
      const term = asTrimmedString(body.term);
      const subclassId = asStringOrNullOrUndefined(body.subclassId);
      const billingId =
        typeof body.billingId === "number"
          ? body.billingId
          : typeof body.billingId === "string"
            ? Number.parseInt(body.billingId, 10)
            : NaN;
      const amount = parseNumberOrUndefined(body.amount);

      if (!classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (!session) return res.status(400).json({ success: false, message: "session is required" });
      if (!term) return res.status(400).json({ success: false, message: "term is required" });
      if (!Number.isInteger(billingId) || billingId < 1) {
        return res.status(400).json({ success: false, message: "billingId must be a positive integer" });
      }
      if (amount === undefined || amount < 0) {
        return res.status(400).json({ success: false, message: "amount must be a valid number >= 0" });
      }
      if (subclassId === undefined && body.subclassId !== undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }

      const created = await classDefaultBillingService.create({
        classId,
        subclassId,
        session,
        term,
        billingId,
        amount,
      });

      return res.status(201).json({
        success: true,
        message: "Class default billing created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create class default billing";
      const status = message.includes("not found")
        ? 404
        : message.includes("required") || message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const classId = asTrimmedString(body.classId);
      const session = asTrimmedString(body.session);
      const term = asTrimmedString(body.term);
      const subclassId = asStringOrNullOrUndefined(body.subclassId);
      const itemsRaw = body.items;

      if (!classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (!session) return res.status(400).json({ success: false, message: "session is required" });
      if (!term) return res.status(400).json({ success: false, message: "term is required" });
      if (subclassId === undefined && body.subclassId !== undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return res.status(400).json({ success: false, message: "items must be a non-empty array" });
      }

      const items = itemsRaw.map((item) => {
        const billingId =
          typeof item?.billingId === "number"
            ? item.billingId
            : typeof item?.billingId === "string"
              ? Number.parseInt(item.billingId, 10)
              : NaN;
        const amount = parseNumberOrUndefined(item?.amount);
        return { billingId, amount };
      });

      const invalid = items.some(
        (x) => !Number.isInteger(x.billingId) || x.billingId < 1 || x.amount === undefined || x.amount < 0,
      );
      if (invalid) {
        return res.status(400).json({
          success: false,
          message: "Each item must contain billingId (positive integer) and amount (number >= 0)",
        });
      }

      const created = await classDefaultBillingService.createMany({
        classId,
        subclassId,
        session,
        term,
        items: items as Array<{ billingId: number; amount: number }>,
      });

      return res.status(201).json({
        success: true,
        message: "Class default billings created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk create class default billings";
      const status = message.includes("not found")
        ? 404
        : message.includes("required") || message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  applyToStudents: async (req: Request, res: Response) => {
    try {
      const createdBy = getAuthenticatedUserId(req);
      if (!createdBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const sessionId = asTrimmedString(body.sessionId);
      const termId = asTrimmedString(body.termId);
      const classId = asTrimmedString(body.classId);
      const subclassId = asTrimmedString(body.subclassId);

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }
      if (!classId) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }

      const result = await classDefaultBillingService.applyToStudents({
        sessionId,
        termId,
        classId,
        createdBy,
        ...(subclassId ? { subclassId } : {}),
      });

      return res.json({
        success: true,
        message: "Class default billings applied to students successfully",
        data: result,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to apply class default billings to students";
      const status = message.includes("not found") || message.includes("Invalid")
        ? 404
        : message.includes("required") ||
            message.includes("must be") ||
            message.includes("does not belong")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subclassId = typeof req.query.subclassId === "string" ? req.query.subclassId : undefined;
      const session = typeof req.query.session === "string" ? req.query.session : undefined;
      const term = typeof req.query.term === "string" ? req.query.term : undefined;
      const billingIdRaw = typeof req.query.billingId === "string" ? req.query.billingId : undefined;
      const billingId = billingIdRaw !== undefined ? parseIntOrUndefined(billingIdRaw) : undefined;
      if (billingIdRaw !== undefined && (billingId === undefined || billingId < 1)) {
        return res.status(400).json({ success: false, message: "billingId must be a positive integer" });
      }

      const rows = await classDefaultBillingService.list({
        classId,
        subclassId,
        session,
        term,
        billingId,
      });

      return res.json({
        success: true,
        message: "Class default billings retrieved successfully",
        data: rows,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve class default billings",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/class-default-billings/{id}:
   *   get:
   *     summary: Get class default billing by ID
   *     tags: [ClassDefaultBillings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   put:
   *     summary: Update class default billing
   *     tags: [ClassDefaultBillings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               classId: { type: string }
   *               subclassId: { type: string, nullable: true }
   *               session: { type: string }
   *               term: { type: string }
   *               billingId: { type: integer, minimum: 1 }
   *               amount: { type: number, minimum: 0 }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete class default billing
   *     tags: [ClassDefaultBillings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: Deleted }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const row = await classDefaultBillingService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Class default billing not found" });
      }

      return res.json({
        success: true,
        message: "Class default billing retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve class default billing",
        error: error?.message,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const body = req.body ?? {};
      const hasClassId = body.classId !== undefined;
      const hasSubclassId = body.subclassId !== undefined;
      const hasSession = body.session !== undefined;
      const hasTerm = body.term !== undefined;
      const hasBillingId = body.billingId !== undefined;
      const hasAmount = body.amount !== undefined;

      if (!hasClassId && !hasSubclassId && !hasSession && !hasTerm && !hasBillingId && !hasAmount) {
        return res.status(400).json({ success: false, message: "At least one field is required" });
      }

      const classId = hasClassId ? asTrimmedString(body.classId) : undefined;
      const session = hasSession ? asTrimmedString(body.session) : undefined;
      const term = hasTerm ? asTrimmedString(body.term) : undefined;
      const subclassId = hasSubclassId ? asStringOrNullOrUndefined(body.subclassId) : undefined;

      if (hasClassId && !classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (hasSession && !session) return res.status(400).json({ success: false, message: "session is required" });
      if (hasTerm && !term) return res.status(400).json({ success: false, message: "term is required" });
      if (hasSubclassId && subclassId === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }

      let billingId: number | undefined = undefined;
      if (hasBillingId) {
        const parsed =
          typeof body.billingId === "number"
            ? body.billingId
            : typeof body.billingId === "string"
              ? Number.parseInt(body.billingId, 10)
              : NaN;
        if (!Number.isInteger(parsed) || parsed < 1) {
          return res.status(400).json({ success: false, message: "billingId must be a positive integer" });
        }
        billingId = parsed;
      }

      let amount: number | undefined = undefined;
      if (hasAmount) {
        const parsed = parseNumberOrUndefined(body.amount);
        if (parsed === undefined || parsed < 0) {
          return res.status(400).json({ success: false, message: "amount must be a valid number >= 0" });
        }
        amount = parsed;
      }

      const existing = await classDefaultBillingService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Class default billing not found" });
      }

      const updated = await classDefaultBillingService.update(id, {
        ...(hasClassId ? { classId } : {}),
        ...(hasSubclassId ? { subclassId } : {}),
        ...(hasSession ? { session } : {}),
        ...(hasTerm ? { term } : {}),
        ...(hasBillingId ? { billingId } : {}),
        ...(hasAmount ? { amount } : {}),
      });

      return res.json({
        success: true,
        message: "Class default billing updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update class default billing";
      const status = message.includes("not found")
        ? 404
        : message.includes("required") || message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const existing = await classDefaultBillingService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Class default billing not found" });
      }

      const deleted = await classDefaultBillingService.delete(id);
      return res.json({
        success: true,
        message: "Class default billing deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete class default billing",
        error: error?.message,
      });
    }
  },
};
