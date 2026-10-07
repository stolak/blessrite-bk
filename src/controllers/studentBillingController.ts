import { Request, Response } from "express";
import { StudentBillingStatus } from "@prisma/client";
import { parseIntOrUndefined } from "../utils/request";
import { studentBillingService } from "../services/studentBillingService";

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
 * /api/v1/student-billings:
 *   post:
 *     summary: Create student billing row
 *     tags: [StudentBillings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, classId, session, term, billingId, amount]
 *             properties:
 *               studentId: { type: string }
 *               classId: { type: string }
 *               subclassId: { type: string, nullable: true }
 *               session: { type: string }
 *               term: { type: string }
 *               billingId: { type: integer, minimum: 1 }
 *               amount: { type: number, minimum: 0 }
 *               referentId: { type: string, nullable: true, description: "Auto-generated when omitted." }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 *   get:
 *     summary: List student billings
 *     tags: [StudentBillings]
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
 *         name: billingId
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
 * /api/v1/student-billings/bulk:
 *   post:
 *     summary: Bulk create student billings
 *     tags: [StudentBillings]
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
 *                   required: [billingId, amount]
 *                   properties:
 *                     billingId: { type: integer, minimum: 1 }
 *                     amount: { type: number, minimum: 0 }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/student-billings/status/bulk:
 *   patch:
 *     summary: Bulk update student billing status
 *     tags: [StudentBillings]
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
 * /api/v1/student-billings/post/bulk:
 *   patch:
 *     summary: Bulk post approved student billings
 *     tags: [StudentBillings]
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
/**
 * @openapi
 * /api/v1/student-billings/report/summary:
 *   get:
 *     summary: Student billing/discount summary report
 *     tags: [StudentBillings]
 *     parameters:
 *       - in: query
 *         name: session
 *         schema: { type: string }
 *       - in: query
 *         name: term
 *         schema: { type: string }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: subclassId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Report rows }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/student-billings/students/{studentId}/periods:
 *   get:
 *     summary: List billing/discount periods for a student
 *     description: |
 *       Returns distinct session/term/class/subclass combinations where the student
 *       has at least one billing or concession discount record.
 *     tags: [StudentBillings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Student billing/discount periods
 *       400:
 *         description: studentId is required
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/student-billings/combined:
 *   get:
 *     summary: List student billings and concession discounts together
 *     description: |
 *       Returns all matching billing and concession discount rows for a student
 *       without pagination. Optional filters: sessionId, termId, status.
 *     tags: [StudentBillings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, APPROVED]
 *     responses:
 *       200:
 *         description: Combined billing and concession discount rows
 *       400:
 *         description: Validation error
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/student-billings/notify/parent:
 *   post:
 *     summary: Send student period bill notification to parent email
 *     tags: [StudentBillings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, classId, sessionId, termId]
 *             properties:
 *               studentId:
 *                 type: string
 *                 description: Student ID (preferred)
 *               studendId:
 *                 type: string
 *                 description: Backward-compatible alias for studentId
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent successfully, or skipped with reason
 *       400:
 *         description: Validation error
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/student-billings/report/no-billing:
 *   get:
 *     summary: Students with no billing for the filter scope
 *     tags: [StudentBillings]
 *     parameters:
 *       - in: query
 *         name: session
 *         schema: { type: string }
 *       - in: query
 *         name: term
 *         schema: { type: string }
 *       - in: query
 *         name: classId
 *         schema: { type: string }
 *       - in: query
 *         name: subclassId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Report rows }
 *       500: { description: Server error }
 */
export const studentBillingController = {
  notifyParentPeriodBill: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const studentId = asTrimmedString(body.studentId) ?? asTrimmedString(body.studendId);
      const classId = asTrimmedString(body.classId);
      const subclassId =
        body.subclassId === undefined ? undefined : asStringOrNullOrUndefined(body.subclassId);
      const sessionId = asTrimmedString(body.sessionId);
      const termId = asTrimmedString(body.termId);

      if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
      if (!classId) return res.status(400).json({ success: false, message: "classId is required" });
      if (!sessionId) return res.status(400).json({ success: false, message: "sessionId is required" });
      if (!termId) return res.status(400).json({ success: false, message: "termId is required" });
      if (subclassId === undefined && body.subclassId !== undefined) {
        return res
          .status(400)
          .json({ success: false, message: "subclassId must be a string, null, or omitted" });
      }

      const result = await studentBillingService.notifyParentPeriodBill({
        studentId,
        classId,
        ...(subclassId !== undefined && subclassId !== null ? { subclassId } : {}),
        sessionId,
        termId,
      });

      return res.json({
        success: true,
        message: result.sent
          ? "Parent period bill notification sent successfully"
          : "Parent period bill notification skipped",
        data: result,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to send parent period bill notification";
      const status =
        message.includes("required") || message.includes("must be")
          ? 400
          : message.includes("not found")
            ? 404
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },

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
      const billingId =
        typeof body.billingId === "number"
          ? body.billingId
          : typeof body.billingId === "string"
            ? Number.parseInt(body.billingId, 10)
            : NaN;
      const amount = parseNumberOrUndefined(body.amount);

      if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
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
      const referentId = asStringOrNullOrUndefined(body.referentId);
      if (referentId === undefined && body.referentId !== undefined) {
        return res.status(400).json({ success: false, message: "referentId must be a string, null, or omitted" });
      }

      const created = await studentBillingService.create({
        studentId,
        classId,
        subclassId,
        session,
        term,
        billingId,
        amount,
        ...(body.referentId !== undefined ? { referentId } : {}),
        createdBy,
      });

      return res.status(201).json({
        success: true,
        message: "Student billing created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create student billing";
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
        const billingId =
          typeof entry.billingId === "number"
            ? entry.billingId
            : typeof entry.billingId === "string"
              ? Number.parseInt(entry.billingId, 10)
              : NaN;
        const amount = parseNumberOrUndefined(entry.amount);
        if (!Number.isInteger(billingId) || billingId < 1) {
          throw new Error("Each entry must contain billingId as a positive integer");
        }
        if (amount === undefined || amount < 0) {
          throw new Error("Each entry must contain amount as a valid number >= 0");
        }

        return {
          billingId,
          amount,
        };
      });

      const created = await studentBillingService.createMany({
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
        message: "Student billings created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk create student billings";
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

      const result = await studentBillingService.updateStatusMany({
        ids,
        status: status as StudentBillingStatus,
        actedBy,
      });

      return res.json({
        success: true,
        message: "Student billing statuses updated successfully",
        data: {
          updatedCount: result.count,
          status,
        },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk update student billing status";
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

      const result = await studentBillingService.postMany({ ids, actedBy });
      return res.json({
        success: true,
        message: "Student billings posted successfully",
        data: { postedCount: result.count },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to post student billings";
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

      const billingIdRaw = typeof req.query.billingId === "string" ? req.query.billingId : undefined;
      const billingId = billingIdRaw !== undefined ? parseIntOrUndefined(billingIdRaw) : undefined;
      if (billingIdRaw !== undefined && (billingId === undefined || billingId < 1)) {
        return res.status(400).json({ success: false, message: "billingId must be a positive integer" });
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
        isPostedRaw === undefined ? undefined : isPostedRaw === "true" ? true : isPostedRaw === "false" ? false : undefined;
      if (isPostedRaw !== undefined && isPosted === undefined) {
        return res.status(400).json({ success: false, message: "isPosted must be true or false" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await studentBillingService.list({
        studentId,
        classId,
        subclassId,
        session,
        term,
        billingId,
        status,
        referentId,
        isPosted,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Student billings retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student billings",
        error: error?.message,
      });
    }
  },

  listCombined: async (req: Request, res: Response) => {
    try {
      const studentId =
        typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
      const sessionId =
        typeof req.query.sessionId === "string"
          ? req.query.sessionId.trim()
          : typeof req.query.session === "string"
            ? req.query.session.trim()
            : undefined;
      const termId =
        typeof req.query.termId === "string"
          ? req.query.termId.trim()
          : typeof req.query.term === "string"
            ? req.query.term.trim()
            : undefined;

      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw !== undefined &&
        Object.values(StudentBillingStatus).includes(statusRaw as StudentBillingStatus)
          ? (statusRaw as StudentBillingStatus)
          : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const data = await studentBillingService.listCombinedWithConcessionDiscounts({
        studentId,
        ...(sessionId ? { sessionId } : {}),
        ...(termId ? { termId } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "Student billings and concession discounts retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve student billings and concession discounts";
      const code = message.includes("not found")
        ? 404
        : message.includes("required")
          ? 400
          : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  reportSummary: async (req: Request, res: Response) => {
    try {
      const session = typeof req.query.session === "string" ? req.query.session : undefined;
      const term = typeof req.query.term === "string" ? req.query.term : undefined;
      const classId =
        typeof req.query.classId === "string"
          ? req.query.classId
          : typeof req.query.class === "string"
            ? req.query.class
            : undefined;
      const subclassId =
        typeof req.query.subclassId === "string"
          ? req.query.subclassId
          : typeof req.query.subclass === "string"
            ? req.query.subclass
            : undefined;

      const rows = await studentBillingService.billingDiscountReport({
        session,
        term,
        classId,
        subclassId,
      });

      return res.json({
        success: true,
        message: "Student billing/discount report retrieved successfully",
        data: rows,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student billing/discount report",
        error: error?.message,
      });
    }
  },

  listStudentPeriods: async (req: Request, res: Response) => {
    try {
      const studentId =
        typeof req.params.studentId === "string" ? req.params.studentId.trim() : "";
      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const periods = await studentBillingService.listStudentBillingDiscountPeriods(studentId);
      return res.json({
        success: true,
        message: "Student billing/discount periods retrieved successfully",
        data: periods,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve student billing/discount periods";
      const code = message.includes("not found")
        ? 404
        : message.includes("required")
          ? 400
          : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  reportNoBilling: async (req: Request, res: Response) => {
    try {
      const session = typeof req.query.session === "string" ? req.query.session : undefined;
      const term = typeof req.query.term === "string" ? req.query.term : undefined;
      const classId =
        typeof req.query.classId === "string"
          ? req.query.classId
          : typeof req.query.class === "string"
            ? req.query.class
            : undefined;
      const subclassId =
        typeof req.query.subclassId === "string"
          ? req.query.subclassId
          : typeof req.query.subclass === "string"
            ? req.query.subclass
            : undefined;

      const rows = await studentBillingService.studentsWithoutBillingReport({
        session,
        term,
        classId,
        subclassId,
      });

      return res.json({
        success: true,
        message: "Students with no billing report retrieved successfully",
        data: rows,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve students with no billing report",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/student-billings/{id}:
   *   get:
   *     summary: Get student billing by ID
   *     tags: [StudentBillings]
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
   *     summary: Update student billing
   *     tags: [StudentBillings]
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
   *               billingId: { type: integer, minimum: 1 }
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
   *     summary: Delete student billing
   *     tags: [StudentBillings]
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
      const row = await studentBillingService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Student billing not found" });
      }
      return res.json({
        success: true,
        message: "Student billing retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve student billing",
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
        "billingId",
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

      let billingId: number | undefined;
      if (body.billingId !== undefined) {
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

      const existing = await studentBillingService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Student billing not found" });
      }
      if (body.status === StudentBillingStatus.DRAFT && existing.isPosted) {
        return res.status(400).json({ success: false, message: "Posted records cannot be changed to DRAFT" });
      }

      const updated = await studentBillingService.update(id, {
        ...(body.studentId !== undefined ? { studentId } : {}),
        ...(body.classId !== undefined ? { classId } : {}),
        ...(body.subclassId !== undefined ? { subclassId } : {}),
        ...(body.session !== undefined ? { session } : {}),
        ...(body.term !== undefined ? { term } : {}),
        ...(body.billingId !== undefined ? { billingId } : {}),
        ...(body.amount !== undefined ? { amount } : {}),
        ...(body.referentId !== undefined ? { referentId } : {}),
        ...(body.status !== undefined ? { status: body.status as StudentBillingStatus } : {}),
        ...(body.createdBy !== undefined ? { createdBy } : {}),
        ...(body.isPosted !== undefined ? { isPosted } : {}),
      });

      return res.json({
        success: true,
        message: "Student billing updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update student billing";
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
      const existing = await studentBillingService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Student billing not found" });
      }
      const deleted = await studentBillingService.delete(id);
      return res.json({
        success: true,
        message: "Student billing deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete student billing";
      const status = message.includes("Cannot delete") ? 409 : 500;
      return res.status(status).json({
        success: false,
        message,
        error: message,
      });
    }
  },
};
