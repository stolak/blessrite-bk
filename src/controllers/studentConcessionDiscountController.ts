import { Request, Response } from "express";
import { StudentBillingStatus } from "@prisma/client";
import { parseIntOrUndefined } from "../utils/request";
import { studentConcessionDiscountService } from "../services/studentConcessionDiscountService";

function asTrimmedString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringOrNullOrUndefined(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return v;
}

function parseNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getAuthenticatedUserId(req: Request): string | undefined {
  const raw = (req as { user?: { id?: unknown } }).user?.id;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * @openapi
 * /api/v1/student-concession-discounts:
 *   post:
 *     summary: Create student concession discount row
 *     tags: [StudentConcessionDiscounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, classId, session, term, concessionDiscountId, amount]
 *             properties:
 *               studentId: { type: string }
 *               classId: { type: string }
 *               subclassId: { type: string, nullable: true }
 *               session: { type: string }
 *               term: { type: string }
 *               concessionDiscountId: { type: integer, minimum: 1 }
 *               amount: { type: number, minimum: 0 }
 *               referentId: { type: string, nullable: true, description: "Auto-generated when omitted." }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 *   get:
 *     summary: List student concession discounts
 *     tags: [StudentConcessionDiscounts]
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema: { type: string }
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
 *         name: concessionDiscountId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, APPROVED, CANCELLED] }
 *       - in: query
 *         name: referentId
 *         schema: { type: string }
 *       - in: query
 *         name: isPosted
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: List }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/student-concession-discounts/bulk:
 *   post:
 *     summary: Bulk create student concession discounts
 *     tags: [StudentConcessionDiscounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entries]
 *             properties:
 *               studentId: { type: string }
 *               classId: { type: string }
 *               subclassId: { type: string, nullable: true }
 *               session: { type: string }
 *               term: { type: string }
 *               referentId: { type: string, nullable: true, description: "Shared referentId for batch. Auto-generated when omitted." }
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [concessionDiscountId, amount]
 *                   properties:
 *                     concessionDiscountId: { type: integer, minimum: 1 }
 *                     amount: { type: number, minimum: 0 }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/student-concession-discounts/status/bulk:
 *   patch:
 *     summary: Bulk update student concession discount status
 *     tags: [StudentConcessionDiscounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, status]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *               status:
 *                 type: string
 *                 enum: [DRAFT, APPROVED]
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/student-concession-discounts/post/bulk:
 *   patch:
 *     summary: Bulk post approved student concession discounts
 *     tags: [StudentConcessionDiscounts]
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
 *                   type: integer
 *                   minimum: 1
 *     responses:
 *       200: { description: Posted }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
export const studentConcessionDiscountController = {
  create: async (req: Request, res: Response) => {
    try {
      const createdBy = getAuthenticatedUserId(req);
      if (!createdBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const studentId = asTrimmedString(body.studentId);
      const classId = asTrimmedString(body.classId);
      const subclassId = asStringOrNullOrUndefined(body.subclassId);
      const session = asTrimmedString(body.session);
      const term = asTrimmedString(body.term);
      const concessionDiscountId =
        typeof body.concessionDiscountId === "number"
          ? body.concessionDiscountId
          : typeof body.concessionDiscountId === "string"
            ? Number.parseInt(body.concessionDiscountId, 10)
            : NaN;
      const amount = parseNumberOrUndefined(body.amount);

      if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
      if (!classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (!session) return res.status(400).json({ success: false, message: "session is required" });
      if (!term) return res.status(400).json({ success: false, message: "term is required" });
      if (!Number.isInteger(concessionDiscountId) || concessionDiscountId < 1) {
        return res.status(400).json({ success: false, message: "concessionDiscountId must be a positive integer" });
      }
      if (amount === undefined || amount < 0) {
        return res.status(400).json({ success: false, message: "amount must be a valid number >= 0" });
      }
      if (subclassId === undefined && body.subclassId !== undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }
      const referentId = asStringOrNullOrUndefined(body.referentId);
      if (referentId === undefined && body.referentId !== undefined) {
        return res.status(400).json({ success: false, message: "referentId must be a string, null, or omitted" });
      }

      const created = await studentConcessionDiscountService.create({
        studentId,
        classId,
        subclassId,
        session,
        term,
        concessionDiscountId,
        amount,
        ...(body.referentId !== undefined ? { referentId } : {}),
        createdBy,
      });

      return res.status(201).json({
        success: true,
        message: "Student concession discount created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create student concession discount";
      const status =
        message.includes("required") || message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const createdBy = getAuthenticatedUserId(req);
      if (!createdBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const studentId = asTrimmedString(body.studentId);
      const classId = asTrimmedString(body.classId);
      const subclassId = asStringOrNullOrUndefined(body.subclassId);
      const session = asTrimmedString(body.session);
      const term = asTrimmedString(body.term);

      if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
      if (!classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (!session) return res.status(400).json({ success: false, message: "session is required" });
      if (!term) return res.status(400).json({ success: false, message: "term is required" });
      if (subclassId === undefined && body.subclassId !== undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }

      const referentId = asStringOrNullOrUndefined(body.referentId);
      if (referentId === undefined && body.referentId !== undefined) {
        return res.status(400).json({ success: false, message: "referentId must be a string, null, or omitted" });
      }
      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return res.status(400).json({ success: false, message: "entries must be a non-empty array" });
      }

      const entries = body.entries.map((entry: any) => {
        const concessionDiscountId =
          typeof entry.concessionDiscountId === "number"
            ? entry.concessionDiscountId
            : typeof entry.concessionDiscountId === "string"
              ? Number.parseInt(entry.concessionDiscountId, 10)
              : NaN;
        const amount = parseNumberOrUndefined(entry.amount);
        if (!Number.isInteger(concessionDiscountId) || concessionDiscountId < 1) {
          throw new Error("Each entry must contain concessionDiscountId as a positive integer");
        }
        if (amount === undefined || amount < 0) {
          throw new Error("Each entry must contain amount as a valid number >= 0");
        }

        return {
          concessionDiscountId,
          amount,
        };
      });

      const created = await studentConcessionDiscountService.createMany({
        studentId,
        classId,
        ...(body.subclassId !== undefined ? { subclassId } : {}),
        session,
        term,
        ...(body.referentId !== undefined ? { referentId } : {}),
        createdBy,
        entries,
      });

      return res.status(201).json({
        success: true,
        message: "Student concession discounts created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk create student concession discounts";
      const status =
        message.includes("required") || message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  updateStatusBulk: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const idsRaw = body.ids;
      const status = body.status;

      if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
        return res.status(400).json({ success: false, message: "ids must be a non-empty array" });
      }
      const ids = idsRaw.map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN));
      if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
        return res.status(400).json({ success: false, message: "ids must contain only positive integers" });
      }
      if (![StudentBillingStatus.DRAFT, StudentBillingStatus.APPROVED].includes(status)) {
        return res.status(400).json({ success: false, message: "status must be APPROVED or DRAFT" });
      }

      const result = await studentConcessionDiscountService.updateStatusMany({
        ids,
        status: status as StudentBillingStatus,
        actedBy,
      });

      return res.json({
        success: true,
        message: "Student concession discount statuses updated successfully",
        data: {
          updatedCount: result.count,
          status,
        },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk update student concession discount status";
      const status =
        message.includes("required") ||
        message.includes("must be") ||
        message.includes("invalid") ||
        message.includes("cannot")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  postBulk: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const idsRaw = body.ids;
      if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
        return res.status(400).json({ success: false, message: "ids must be a non-empty array" });
      }
      const ids = idsRaw.map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN));
      if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
        return res.status(400).json({ success: false, message: "ids must contain only positive integers" });
      }

      const result = await studentConcessionDiscountService.postMany({ ids, actedBy });
      return res.json({
        success: true,
        message: "Student concession discounts posted successfully",
        data: { postedCount: result.count },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to post student concession discounts";
      const status =
        message.includes("required") ||
        message.includes("must be") ||
        message.includes("invalid") ||
        message.includes("Only APPROVED")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
      const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
      const subclassId = typeof req.query.subclassId === "string" ? req.query.subclassId : undefined;
      const session = typeof req.query.session === "string" ? req.query.session : undefined;
      const term = typeof req.query.term === "string" ? req.query.term : undefined;
      const referentId = typeof req.query.referentId === "string" ? req.query.referentId : undefined;

      const concessionDiscountIdRaw =
        typeof req.query.concessionDiscountId === "string" ? req.query.concessionDiscountId : undefined;
      const concessionDiscountId =
        concessionDiscountIdRaw !== undefined ? parseIntOrUndefined(concessionDiscountIdRaw) : undefined;
      if (concessionDiscountIdRaw !== undefined && (concessionDiscountId === undefined || concessionDiscountId < 1)) {
        return res.status(400).json({ success: false, message: "concessionDiscountId must be a positive integer" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw !== undefined && Object.values(StudentBillingStatus).includes(statusRaw as StudentBillingStatus)
          ? (statusRaw as StudentBillingStatus)
          : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const isPostedRaw = typeof req.query.isPosted === "string" ? req.query.isPosted : undefined;
      const isPosted =
        isPostedRaw === undefined
          ? undefined
          : isPostedRaw === "true"
            ? true
            : isPostedRaw === "false"
              ? false
              : undefined;
      if (isPostedRaw !== undefined && isPosted === undefined) {
        return res.status(400).json({ success: false, message: "isPosted must be true or false" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await studentConcessionDiscountService.list({
        studentId,
        classId,
        subclassId,
        session,
        term,
        concessionDiscountId,
        status,
        referentId,
        isPosted,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Student concession discounts retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student concession discounts",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/student-concession-discounts/{id}:
   *   get:
   *     summary: Get student concession discount by ID
   *     tags: [StudentConcessionDiscounts]
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
   *     summary: Update student concession discount
   *     tags: [StudentConcessionDiscounts]
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
   *               studentId: { type: string }
   *               classId: { type: string }
   *               subclassId: { type: string, nullable: true }
   *               session: { type: string }
   *               term: { type: string }
   *               concessionDiscountId: { type: integer, minimum: 1 }
   *               amount: { type: number, minimum: 0 }
   *               referentId: { type: string, nullable: true }
   *               status: { type: string, enum: [DRAFT, APPROVED, CANCELLED] }
   *               createdBy: { type: string, nullable: true }
 *               isPosted: { type: boolean }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete student concession discount
   *     tags: [StudentConcessionDiscounts]
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
      const row = await studentConcessionDiscountService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Student concession discount not found" });
      }
      return res.json({
        success: true,
        message: "Student concession discount retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student concession discount",
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
      const hasAnyField = [
        "studentId",
        "classId",
        "subclassId",
        "session",
        "term",
        "concessionDiscountId",
        "amount",
        "referentId",
        "status",
        "createdBy",
        "isPosted",
      ].some((k) => body[k] !== undefined);
      if (!hasAnyField) {
        return res.status(400).json({ success: false, message: "At least one field is required" });
      }

      const studentId = body.studentId !== undefined ? asTrimmedString(body.studentId) : undefined;
      const classId = body.classId !== undefined ? asTrimmedString(body.classId) : undefined;
      const subclassId = body.subclassId !== undefined ? asStringOrNullOrUndefined(body.subclassId) : undefined;
      const session = body.session !== undefined ? asTrimmedString(body.session) : undefined;
      const term = body.term !== undefined ? asTrimmedString(body.term) : undefined;
      const referentId = body.referentId !== undefined ? asStringOrNullOrUndefined(body.referentId) : undefined;
      const createdBy = body.createdBy !== undefined ? asStringOrNullOrUndefined(body.createdBy) : undefined;

      if (body.studentId !== undefined && !studentId) return res.status(400).json({ success: false, message: "studentId is required" });
      if (body.classId !== undefined && !classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (body.session !== undefined && !session) return res.status(400).json({ success: false, message: "session is required" });
      if (body.term !== undefined && !term) return res.status(400).json({ success: false, message: "term is required" });
      if (body.subclassId !== undefined && subclassId === undefined) {
        return res.status(400).json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }
      if (body.referentId !== undefined && referentId === undefined) {
        return res.status(400).json({ success: false, message: "referentId must be a string, null, or omitted" });
      }
      if (body.createdBy !== undefined && createdBy === undefined) {
        return res.status(400).json({ success: false, message: "createdBy must be a string, null, or omitted" });
      }

      let concessionDiscountId: number | undefined;
      if (body.concessionDiscountId !== undefined) {
        const parsed =
          typeof body.concessionDiscountId === "number"
            ? body.concessionDiscountId
            : typeof body.concessionDiscountId === "string"
              ? Number.parseInt(body.concessionDiscountId, 10)
              : NaN;
        if (!Number.isInteger(parsed) || parsed < 1) {
          return res.status(400).json({ success: false, message: "concessionDiscountId must be a positive integer" });
        }
        concessionDiscountId = parsed;
      }

      const amount = body.amount !== undefined ? parseNumberOrUndefined(body.amount) : undefined;
      if (body.amount !== undefined && (amount === undefined || amount < 0)) {
        return res.status(400).json({ success: false, message: "amount must be a valid number >= 0" });
      }

      if (body.status !== undefined && !Object.values(StudentBillingStatus).includes(body.status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      let isPosted: boolean | undefined;
      if (body.isPosted !== undefined) {
        if (typeof body.isPosted !== "boolean") {
          return res.status(400).json({ success: false, message: "isPosted must be a boolean" });
        }
        isPosted = body.isPosted;
      }

      const existing = await studentConcessionDiscountService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Student concession discount not found" });
      }
      if (body.status === StudentBillingStatus.DRAFT && existing.isPosted) {
        return res.status(400).json({ success: false, message: "Posted records cannot be changed to DRAFT" });
      }

      const updated = await studentConcessionDiscountService.update(id, {
        ...(body.studentId !== undefined ? { studentId } : {}),
        ...(body.classId !== undefined ? { classId } : {}),
        ...(body.subclassId !== undefined ? { subclassId } : {}),
        ...(body.session !== undefined ? { session } : {}),
        ...(body.term !== undefined ? { term } : {}),
        ...(body.concessionDiscountId !== undefined ? { concessionDiscountId } : {}),
        ...(body.amount !== undefined ? { amount } : {}),
        ...(body.referentId !== undefined ? { referentId } : {}),
        ...(body.status !== undefined ? { status: body.status as StudentBillingStatus } : {}),
        ...(body.createdBy !== undefined ? { createdBy } : {}),
        ...(body.isPosted !== undefined ? { isPosted } : {}),
      });

      return res.json({
        success: true,
        message: "Student concession discount updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update student concession discount";
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
      const existing = await studentConcessionDiscountService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Student concession discount not found" });
      }
      const deleted = await studentConcessionDiscountService.delete(id);
      return res.json({
        success: true,
        message: "Student concession discount deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete student concession discount";
      const status = message.includes("Cannot delete") ? 409 : 500;
      return res.status(status).json({
        success: false,
        message,
        error: message,
      });
    }
  },
};
