import { Request, Response } from "express";
import { BatchStatus, JournalTransferType, Status } from "@prisma/client";
import { parseIntOrUndefined } from "../utils/request";
import { tempJournalTransferService } from "../services/tempJournalTransferService";

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
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : undefined;
  }
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseDateOrUndefined(v: unknown): Date | undefined {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v;
  }
  if (typeof v !== "string") {
    return undefined;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateOrNullOrUndefined(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return parseDateOrUndefined(v);
}

function getAuthenticatedUserId(req: Request): string | undefined {
  const raw = (req as { user?: { id?: unknown } }).user?.id;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

type ParsedCreateEntry = {
  transType: JournalTransferType;
  accountId: number;
  debit?: number;
  credit?: number;
  status?: Status;
  batchStatus?: BatchStatus;
  referenceNo?: string | null;
  manualReferenceNo?: string | null;
  transactionDate: Date;
  postedAt?: Date | null;
  postedBy?: string | null;
  remarks?: string | null;
  finalPostedAt?: Date | null;
  finalPostedBy?: string | null;
  projectId?: string | null;
};

function parseCreateEntry(
  body: any,
  options?: { allowReferenceNo?: boolean },
): { data?: ParsedCreateEntry; message?: string } {
  const allowReferenceNo = options?.allowReferenceNo ?? true;
  const transType = body.transType;
  const accountId =
    typeof body.accountId === "number"
      ? body.accountId
      : typeof body.accountId === "string"
        ? Number.parseInt(body.accountId, 10)
        : NaN;
  const transactionDate = parseDateOrUndefined(body.transactionDate);

  if (!Object.values(JournalTransferType).includes(transType)) {
    return { message: "transType is invalid" };
  }
  if (!Number.isInteger(accountId) || accountId < 1) {
    return { message: "accountId must be a positive integer" };
  }
  if (!transactionDate) {
    return { message: "transactionDate must be a valid date" };
  }

  const debit = body.debit !== undefined ? parseNumberOrUndefined(body.debit) : undefined;
  const credit = body.credit !== undefined ? parseNumberOrUndefined(body.credit) : undefined;
  const postedAt = parseDateOrNullOrUndefined(body.postedAt);
  const finalPostedAt = parseDateOrNullOrUndefined(body.finalPostedAt);
  const projectId = asStringOrNullOrUndefined(body.projectId);
  const referenceNo = asStringOrNullOrUndefined(body.referenceNo);
  const manualReferenceNo = asStringOrNullOrUndefined(body.manualReferenceNo);
  const postedBy = asStringOrNullOrUndefined(body.postedBy);
  const remarks = asStringOrNullOrUndefined(body.remarks);
  const finalPostedBy = asStringOrNullOrUndefined(body.finalPostedBy);

  if (body.debit !== undefined && debit === undefined) {
    return { message: "debit must be a valid number" };
  }
  if (body.credit !== undefined && credit === undefined) {
    return { message: "credit must be a valid number" };
  }
  if (body.postedAt !== undefined && body.postedAt !== null && !postedAt) {
    return { message: "postedAt must be a valid date or null" };
  }
  if (body.finalPostedAt !== undefined && body.finalPostedAt !== null && !finalPostedAt) {
    return { message: "finalPostedAt must be a valid date or null" };
  }
  if (body.status !== undefined && !Object.values(Status).includes(body.status)) {
    return { message: "status is invalid" };
  }
  if (body.batchStatus !== undefined && !Object.values(BatchStatus).includes(body.batchStatus)) {
    return { message: "batchStatus is invalid" };
  }
  if (projectId === undefined && body.projectId !== undefined) {
    return { message: "projectId must be a string, null, or omitted" };
  }
  if (!allowReferenceNo && body.referenceNo !== undefined) {
    return { message: "referenceNo must be provided at top-level for bulk create" };
  }
  if (allowReferenceNo && referenceNo === undefined && body.referenceNo !== undefined) {
    return { message: "referenceNo must be a string, null, or omitted" };
  }
  if (manualReferenceNo === undefined && body.manualReferenceNo !== undefined) {
    return { message: "manualReferenceNo must be a string, null, or omitted" };
  }
  if (postedBy === undefined && body.postedBy !== undefined) {
    return { message: "postedBy must be a string, null, or omitted" };
  }
  if (remarks === undefined && body.remarks !== undefined) {
    return { message: "remarks must be a string, null, or omitted" };
  }
  if (finalPostedBy === undefined && body.finalPostedBy !== undefined) {
    return { message: "finalPostedBy must be a string, null, or omitted" };
  }

  return {
    data: {
      transType: transType as JournalTransferType,
      accountId,
      ...(debit !== undefined ? { debit } : {}),
      ...(credit !== undefined ? { credit } : {}),
      ...(body.status !== undefined ? { status: body.status as Status } : {}),
      ...(body.batchStatus !== undefined ? { batchStatus: body.batchStatus as BatchStatus } : {}),
      ...(allowReferenceNo && body.referenceNo !== undefined ? { referenceNo } : {}),
      ...(body.manualReferenceNo !== undefined ? { manualReferenceNo } : {}),
      transactionDate,
      ...(body.postedAt !== undefined ? { postedAt } : {}),
      ...(body.postedBy !== undefined ? { postedBy } : {}),
      ...(body.remarks !== undefined ? { remarks } : {}),
      ...(body.finalPostedAt !== undefined ? { finalPostedAt } : {}),
      ...(body.finalPostedBy !== undefined ? { finalPostedBy } : {}),
      ...(body.projectId !== undefined ? { projectId } : {}),
    },
  };
}

/**
 * @openapi
 * /api/v1/temp-journal-transfers/reference/{referenceNo}/bulk:
 *   post:
 *     summary: Add multiple temp journal transfers to an existing referenceNo
 *     tags: [TempJournalTransfers]
 *     parameters:
 *       - in: path
 *         name: referenceNo
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entries]
 *             properties:
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [transType, accountId, transactionDate]
 *                   properties:
 *                     transType: { type: string, enum: [Debit, Credit] }
 *                     accountId: { type: integer, minimum: 1 }
 *                     debit: { type: number, minimum: 0 }
 *                     credit: { type: number, minimum: 0 }
 *                     status: { type: string, enum: [Active, Inactive, Archived] }
 *                     batchStatus: { type: string, enum: [Pending, Processed, Failed] }
 *                     manualReferenceNo: { type: string, nullable: true }
 *                     transactionDate: { type: string, format: date-time }
 *                     postedAt: { type: string, format: date-time, nullable: true }
 *                     postedBy: { type: string, nullable: true }
 *                     remarks: { type: string, nullable: true }
 *                     finalPostedAt: { type: string, format: date-time, nullable: true }
 *                     finalPostedBy: { type: string, nullable: true }
 *                     projectId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: referenceNo or related records not found }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/temp-journal-transfers/bulk:
 *   post:
 *     summary: Bulk create temp journal transfers with one reference number
 *     tags: [TempJournalTransfers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entries]
 *             properties:
 *               referenceNo: { type: string, nullable: true, description: "Optional shared referenceNo for all entries. If omitted, server generates one." }
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [transType, accountId, transactionDate]
 *                   properties:
 *                     transType: { type: string, enum: [Debit, Credit] }
 *                     accountId: { type: integer, minimum: 1 }
 *                     debit: { type: number, minimum: 0 }
 *                     credit: { type: number, minimum: 0 }
 *                     status: { type: string, enum: [Active, Inactive, Archived] }
 *                     batchStatus: { type: string, enum: [Pending, Processed, Failed] }
 *                     manualReferenceNo: { type: string, nullable: true }
 *                     transactionDate: { type: string, format: date-time }
 *                     postedAt: { type: string, format: date-time, nullable: true }
 *                     postedBy: { type: string, nullable: true }
 *                     remarks: { type: string, nullable: true }
 *                     finalPostedAt: { type: string, format: date-time, nullable: true }
 *                     finalPostedBy: { type: string, nullable: true }
 *                     projectId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: Related record not found }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/temp-journal-transfers:
 *   post:
 *     summary: Create temp journal transfer
 *     tags: [TempJournalTransfers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transType, accountId, transactionDate]
 *             properties:
 *               transType: { type: string, enum: [Debit, Credit] }
 *               accountId: { type: integer, minimum: 1 }
 *               debit: { type: number, minimum: 0 }
 *               credit: { type: number, minimum: 0 }
 *               status: { type: string, enum: [Active, Inactive, Archived] }
 *               batchStatus: { type: string, enum: [Pending, Processed, Failed] }
 *               referenceNo: { type: string, nullable: true }
 *               manualReferenceNo: { type: string, nullable: true }
 *               transactionDate: { type: string, format: date-time }
 *               postedAt: { type: string, format: date-time, nullable: true }
 *               postedBy: { type: string, nullable: true }
 *               remarks: { type: string, nullable: true }
 *               finalPostedAt: { type: string, format: date-time, nullable: true }
 *               finalPostedBy: { type: string, nullable: true }
 *               projectId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: Related record not found }
 *       500: { description: Server error }
 *   get:
 *     summary: List temp journal transfers
 *     tags: [TempJournalTransfers]
 *     parameters:
 *       - in: query
 *         name: transType
 *         schema: { type: string, enum: [Debit, Credit] }
 *       - in: query
 *         name: accountId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive, Archived, All] }
 *       - in: query
 *         name: batchStatus
 *         schema: { type: string, enum: [Pending, Processed, Failed] }
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: referenceNo
 *         schema: { type: string }
 *       - in: query
 *         name: manualReferenceNo
 *         schema: { type: string }
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
export const tempJournalTransferController = {
  create: async (req: Request, res: Response) => {
    try {
      const createdById = getAuthenticatedUserId(req);
      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const parsed = parseCreateEntry(body, { allowReferenceNo: true });
      if (!parsed.data) {
        return res.status(400).json({ success: false, message: parsed.message ?? "Validation error" });
      }

      const created = await tempJournalTransferService.create({
        ...parsed.data,
        createdById,
      });

      return res.status(201).json({
        success: true,
        message: "Temp journal transfer created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create temp journal transfer";
      const status = message.includes("not found")
        ? 404
        : message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const createdById = getAuthenticatedUserId(req);
      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body ?? {};
      const referenceNo = asStringOrNullOrUndefined(body.referenceNo);
      if (referenceNo === undefined && body.referenceNo !== undefined) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string, null, or omitted" });
      }
      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return res.status(400).json({ success: false, message: "entries must be a non-empty array" });
      }

      const entries = [];
      for (const entry of body.entries) {
        const parsed = parseCreateEntry(entry, { allowReferenceNo: false });
        if (!parsed.data) {
          return res.status(400).json({ success: false, message: parsed.message ?? "Validation error" });
        }
        entries.push(parsed.data);
      }

      const created = await tempJournalTransferService.createMany({
        createdById,
        ...(body.referenceNo !== undefined ? { referenceNo } : {}),
        entries,
      });

      return res.status(201).json({
        success: true,
        message: "Temp journal transfers created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to bulk create temp journal transfers";
      const status = message.includes("not found")
        ? 404
        : message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  appendBulkByReferenceNo: async (req: Request, res: Response) => {
    try {
      const createdById = getAuthenticatedUserId(req);
      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const referenceNo =
        typeof req.params.referenceNo === "string" ? req.params.referenceNo.trim() : "";
      if (!referenceNo) {
        return res.status(400).json({ success: false, message: "referenceNo is required" });
      }

      const body = req.body ?? {};
      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return res.status(400).json({ success: false, message: "entries must be a non-empty array" });
      }

      const entries = [];
      for (const entry of body.entries) {
        const parsed = parseCreateEntry(entry, { allowReferenceNo: false });
        if (!parsed.data) {
          return res.status(400).json({ success: false, message: parsed.message ?? "Validation error" });
        }
        entries.push(parsed.data);
      }

      const created = await tempJournalTransferService.appendManyByReferenceNo({
        createdById,
        referenceNo,
        entries,
      });

      return res.status(201).json({
        success: true,
        message: "Temp journal transfers appended successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to append temp journal transfers";
      const status = message.includes("not found")
        ? 404
        : message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/temp-journal-transfers/grouped/reference-no:
   *   get:
   *     summary: Group temp journal transfers by referenceNo
   *     tags: [TempJournalTransfers]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [Active, Inactive, Archived, All] }
   *       - in: query
   *         name: batchStatus
   *         schema: { type: string, enum: [Pending, Processed, Failed] }
   *     responses:
   *       200: { description: Grouped list }
   *       400: { description: Validation error }
   *       500: { description: Server error }
   */
  listGroupedByReferenceNo: async (req: Request, res: Response) => {
    try {
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : Object.values(Status).includes(statusRaw as Status)
              ? (statusRaw as Status)
              : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const batchStatusRaw = typeof req.query.batchStatus === "string" ? req.query.batchStatus : undefined;
      const batchStatus =
        batchStatusRaw !== undefined && Object.values(BatchStatus).includes(batchStatusRaw as BatchStatus)
          ? (batchStatusRaw as BatchStatus)
          : undefined;
      if (batchStatusRaw !== undefined && batchStatus === undefined) {
        return res.status(400).json({ success: false, message: "batchStatus is invalid" });
      }

      const rows = await tempJournalTransferService.listGroupedByReferenceNo({
        status,
        batchStatus,
      });

      return res.json({
        success: true,
        message: "Temp journal transfers grouped by referenceNo retrieved successfully",
        data: rows,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve grouped temp journal transfers",
        error: error?.message,
      });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const transTypeRaw = typeof req.query.transType === "string" ? req.query.transType : undefined;
      const transType =
        transTypeRaw !== undefined && Object.values(JournalTransferType).includes(transTypeRaw as JournalTransferType)
          ? (transTypeRaw as JournalTransferType)
          : undefined;
      if (transTypeRaw !== undefined && transType === undefined) {
        return res.status(400).json({ success: false, message: "transType is invalid" });
      }

      const accountIdRaw = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
      const accountId = accountIdRaw !== undefined ? parseIntOrUndefined(accountIdRaw) : undefined;
      if (accountIdRaw !== undefined && (accountId === undefined || accountId < 1)) {
        return res.status(400).json({ success: false, message: "accountId must be a positive integer" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : Object.values(Status).includes(statusRaw as Status)
              ? (statusRaw as Status)
              : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }

      const batchStatusRaw = typeof req.query.batchStatus === "string" ? req.query.batchStatus : undefined;
      const batchStatus =
        batchStatusRaw !== undefined && Object.values(BatchStatus).includes(batchStatusRaw as BatchStatus)
          ? (batchStatusRaw as BatchStatus)
          : undefined;
      if (batchStatusRaw !== undefined && batchStatus === undefined) {
        return res.status(400).json({ success: false, message: "batchStatus is invalid" });
      }

      const projectId = asTrimmedString(req.query.projectId);
      const projectIdRaw = req.query.projectId;
      if (projectIdRaw !== undefined && typeof projectIdRaw !== "string") {
        return res.status(400).json({ success: false, message: "projectId must be a string" });
      }
      const referenceNo = asTrimmedString(req.query.referenceNo);
      const referenceNoRaw = req.query.referenceNo;
      if (referenceNoRaw !== undefined && typeof referenceNoRaw !== "string") {
        return res.status(400).json({ success: false, message: "referenceNo must be a string" });
      }
      const manualReferenceNo = asTrimmedString(req.query.manualReferenceNo);
      const manualReferenceNoRaw = req.query.manualReferenceNo;
      if (manualReferenceNoRaw !== undefined && typeof manualReferenceNoRaw !== "string") {
        return res.status(400).json({ success: false, message: "manualReferenceNo must be a string" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await tempJournalTransferService.list({
        transType,
        accountId,
        status,
        batchStatus,
        ...(projectId !== undefined ? { projectId } : {}),
        ...(referenceNo !== undefined ? { referenceNo } : {}),
        ...(manualReferenceNo !== undefined ? { manualReferenceNo } : {}),
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Temp journal transfers retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve temp journal transfers",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/temp-journal-transfers/{id}:
   *   get:
   *     summary: Get temp journal transfer by ID
   *     tags: [TempJournalTransfers]
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
   *     summary: Update temp journal transfer
   *     tags: [TempJournalTransfers]
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
   *               transType: { type: string, enum: [Debit, Credit] }
   *               accountId: { type: integer, minimum: 1 }
   *               debit: { type: number, minimum: 0 }
   *               credit: { type: number, minimum: 0 }
   *               status: { type: string, enum: [Active, Inactive, Archived] }
   *               batchStatus: { type: string, enum: [Pending, Processed, Failed] }
   *               referenceNo: { type: string, nullable: true }
   *               manualReferenceNo: { type: string, nullable: true }
   *               transactionDate: { type: string, format: date-time }
   *               postedAt: { type: string, format: date-time, nullable: true }
   *               postedBy: { type: string, nullable: true }
   *               remarks: { type: string, nullable: true }
   *               finalPostedAt: { type: string, format: date-time, nullable: true }
   *               finalPostedBy: { type: string, nullable: true }
   *               projectId: { type: string, nullable: true }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete temp journal transfer
   *     tags: [TempJournalTransfers]
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

      const row = await tempJournalTransferService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Temp journal transfer not found" });
      }

      return res.json({
        success: true,
        message: "Temp journal transfer retrieved successfully",
        data: row,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve temp journal transfer",
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
      const hasTransType = body.transType !== undefined;
      const hasAccountId = body.accountId !== undefined;
      const hasDebit = body.debit !== undefined;
      const hasCredit = body.credit !== undefined;
      const hasStatus = body.status !== undefined;
      const hasBatchStatus = body.batchStatus !== undefined;
      const hasReferenceNo = body.referenceNo !== undefined;
      const hasManualReferenceNo = body.manualReferenceNo !== undefined;
      const hasTransactionDate = body.transactionDate !== undefined;
      const hasPostedAt = body.postedAt !== undefined;
      const hasPostedBy = body.postedBy !== undefined;
      const hasRemarks = body.remarks !== undefined;
      const hasFinalPostedAt = body.finalPostedAt !== undefined;
      const hasFinalPostedBy = body.finalPostedBy !== undefined;
      const hasProjectId = body.projectId !== undefined;

      if (
        !hasTransType &&
        !hasAccountId &&
        !hasDebit &&
        !hasCredit &&
        !hasStatus &&
        !hasBatchStatus &&
        !hasReferenceNo &&
        !hasManualReferenceNo &&
        !hasTransactionDate &&
        !hasPostedAt &&
        !hasPostedBy &&
        !hasRemarks &&
        !hasFinalPostedAt &&
        !hasFinalPostedBy &&
        !hasProjectId
      ) {
        return res.status(400).json({ success: false, message: "At least one field is required" });
      }

      if (hasTransType && !Object.values(JournalTransferType).includes(body.transType)) {
        return res.status(400).json({ success: false, message: "transType is invalid" });
      }

      let accountId: number | undefined = undefined;
      if (hasAccountId) {
        const parsed =
          typeof body.accountId === "number"
            ? body.accountId
            : typeof body.accountId === "string"
              ? Number.parseInt(body.accountId, 10)
              : NaN;
        if (!Number.isInteger(parsed) || parsed < 1) {
          return res.status(400).json({ success: false, message: "accountId must be a positive integer" });
        }
        accountId = parsed;
      }

      const debit = hasDebit ? parseNumberOrUndefined(body.debit) : undefined;
      const credit = hasCredit ? parseNumberOrUndefined(body.credit) : undefined;
      if (hasDebit && debit === undefined) {
        return res.status(400).json({ success: false, message: "debit must be a valid number" });
      }
      if (hasCredit && credit === undefined) {
        return res.status(400).json({ success: false, message: "credit must be a valid number" });
      }

      if (hasStatus && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({ success: false, message: "status is invalid" });
      }
      if (hasBatchStatus && !Object.values(BatchStatus).includes(body.batchStatus)) {
        return res.status(400).json({ success: false, message: "batchStatus is invalid" });
      }

      const transactionDate = hasTransactionDate ? parseDateOrUndefined(body.transactionDate) : undefined;
      const postedAt = hasPostedAt ? parseDateOrNullOrUndefined(body.postedAt) : undefined;
      const finalPostedAt = hasFinalPostedAt ? parseDateOrNullOrUndefined(body.finalPostedAt) : undefined;
      if (hasTransactionDate && !transactionDate) {
        return res.status(400).json({ success: false, message: "transactionDate must be a valid date" });
      }
      if (hasPostedAt && body.postedAt !== null && !postedAt) {
        return res.status(400).json({ success: false, message: "postedAt must be a valid date or null" });
      }
      if (hasFinalPostedAt && body.finalPostedAt !== null && !finalPostedAt) {
        return res
          .status(400)
          .json({ success: false, message: "finalPostedAt must be a valid date or null" });
      }

      const projectId = hasProjectId ? asStringOrNullOrUndefined(body.projectId) : undefined;
      const referenceNo = hasReferenceNo ? asStringOrNullOrUndefined(body.referenceNo) : undefined;
      const manualReferenceNo = hasManualReferenceNo
        ? asStringOrNullOrUndefined(body.manualReferenceNo)
        : undefined;
      const postedBy = hasPostedBy ? asStringOrNullOrUndefined(body.postedBy) : undefined;
      const remarks = hasRemarks ? asStringOrNullOrUndefined(body.remarks) : undefined;
      const finalPostedBy = hasFinalPostedBy ? asStringOrNullOrUndefined(body.finalPostedBy) : undefined;
      if (hasProjectId && projectId === undefined) {
        return res.status(400).json({ success: false, message: "projectId must be a string, null, or omitted" });
      }
      if (hasReferenceNo && referenceNo === undefined) {
        return res.status(400).json({ success: false, message: "referenceNo must be a string, null, or omitted" });
      }
      if (hasManualReferenceNo && manualReferenceNo === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "manualReferenceNo must be a string, null, or omitted" });
      }
      if (hasPostedBy && postedBy === undefined) {
        return res.status(400).json({ success: false, message: "postedBy must be a string, null, or omitted" });
      }
      if (hasRemarks && remarks === undefined) {
        return res.status(400).json({ success: false, message: "remarks must be a string, null, or omitted" });
      }
      if (hasFinalPostedBy && finalPostedBy === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "finalPostedBy must be a string, null, or omitted" });
      }

      const existing = await tempJournalTransferService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Temp journal transfer not found" });
      }

      const updated = await tempJournalTransferService.update(id, {
        ...(hasTransType ? { transType: body.transType as JournalTransferType } : {}),
        ...(hasAccountId ? { accountId } : {}),
        ...(hasDebit ? { debit } : {}),
        ...(hasCredit ? { credit } : {}),
        ...(hasStatus ? { status: body.status as Status } : {}),
        ...(hasBatchStatus ? { batchStatus: body.batchStatus as BatchStatus } : {}),
        ...(hasReferenceNo ? { referenceNo } : {}),
        ...(hasManualReferenceNo ? { manualReferenceNo } : {}),
        ...(hasTransactionDate ? { transactionDate } : {}),
        ...(hasPostedAt ? { postedAt } : {}),
        ...(hasPostedBy ? { postedBy } : {}),
        ...(hasRemarks ? { remarks } : {}),
        ...(hasFinalPostedAt ? { finalPostedAt } : {}),
        ...(hasFinalPostedBy ? { finalPostedBy } : {}),
        ...(hasProjectId ? { projectId } : {}),
      });

      return res.json({
        success: true,
        message: "Temp journal transfer updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update temp journal transfer";
      const status = message.includes("not found")
        ? 404
        : message.includes("must be") || message.includes("invalid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/temp-journal-transfers/reference/{referenceNo}:
   *   delete:
   *     summary: Delete temp journal transfers by referenceNo
   *     tags: [TempJournalTransfers]
   *     parameters:
   *       - in: path
   *         name: referenceNo
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Deleted }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       500: { description: Server error }
   */
  deleteByReferenceNo: async (req: Request, res: Response) => {
    try {
      const referenceNo =
        typeof req.params.referenceNo === "string" ? req.params.referenceNo.trim() : "";
      if (!referenceNo) {
        return res.status(400).json({ success: false, message: "referenceNo is required" });
      }

      const deleted = await tempJournalTransferService.deleteByReferenceNo(referenceNo);
      if (deleted.count < 1) {
        return res.status(404).json({ success: false, message: "Temp journal transfer referenceNo not found" });
      }

      return res.json({
        success: true,
        message: "Temp journal transfers deleted successfully",
        data: {
          referenceNo,
          deletedCount: deleted.count,
        },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete temp journal transfers by referenceNo";
      const status = message.includes("required") ? 400 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = parseIntOrUndefined(req.params.id);
      if (id === undefined || id < 1) {
        return res.status(400).json({ success: false, message: "valid id is required" });
      }

      const existing = await tempJournalTransferService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Temp journal transfer not found" });
      }

      const deleted = await tempJournalTransferService.delete(id);
      return res.json({
        success: true,
        message: "Temp journal transfer deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete temp journal transfer",
        error: error?.message,
      });
    }
  },
};
