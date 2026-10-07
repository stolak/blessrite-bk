import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { accountChartService } from "../services/accountChartService";
import { parseAccountTypeFromQuery } from "../utils/accountType";
import { parseIntOrUndefined, parsePositiveIntParam } from "../utils/request";

function rejectGroupOrHeadInBody(body: unknown): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  if ("groupId" in body || "headId" in body || "group_id" in body || "head_id" in body) {
    return "groupId and headId must not be sent; they are derived from subheadId";
  }
  return null;
}

function parseStatusQuery(raw: unknown): Status | "All" | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  if (raw === "All") {
    return "All";
  }
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

const statusValues = `${Status.Active}, ${Status.Inactive}, ${Status.Archived}`;

/**
 * @openapi
 * /api/v1/account-charts:
 *   post:
 *     summary: Create an account chart line
 *     description: |
 *       **Do not send `groupId` or `headId`** — they are set from the subhead. `accountDescription` must be unique per `subheadId`. `accountNo` is optional; when set it must be globally unique.
 *     tags: [AccountCharts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subheadId, accountDescription]
 *             properties:
 *               subheadId: { type: integer, minimum: 1 }
 *               accountDescription: { type: string }
 *               accountNo: { type: string, nullable: true }
 *               accountRef: { type: string, nullable: true }
 *               status: { type: string, enum: [Active, Inactive, Archived] }
 *               rank: { type: integer }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: Subhead not found }
 *       409: { description: Duplicate description for subhead or duplicate account number }
 *       500: { description: Server error }
 *   get:
 *     summary: List account charts
 *     tags: [AccountCharts]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: headId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: subheadId
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive, Archived, All] }
 *       - in: query
 *         name: accountType
 *         schema:
 *           type: string
 *           enum: [Cash, NonCash]
 *         description: Filter by parent subhead account type. Alias query param accountType is also accepted.
 *     responses:
 *       200: { description: List }
 *       400: { description: Bad query }
 *       500: { description: Server error }
 */
export const accountChartController = {
  create: async (req: Request, res: Response) => {
    try {
      const rej = rejectGroupOrHeadInBody(req.body);
      if (rej) {
        return res.status(400).json({ success: false, message: rej });
      }

      const body = req.body ?? {};
      const subheadId =
        typeof body.subheadId === "number" && Number.isInteger(body.subheadId)
          ? body.subheadId
          : typeof body.subheadId === "string"
            ? Number.parseInt(body.subheadId, 10)
            : NaN;

      if (!Number.isFinite(subheadId) || subheadId < 1) {
        return res.status(400).json({
          success: false,
          message: "subheadId is required and must be a positive integer",
        });
      }

      const desc = typeof body.accountDescription === "string" ? body.accountDescription : "";
      if (!desc.trim()) {
        return res.status(400).json({
          success: false,
          message: "accountDescription is required",
        });
      }

      let accountNo: string | null | undefined;
      if (body.accountNo !== undefined && body.accountNo !== null) {
        if (typeof body.accountNo !== "string") {
          return res.status(400).json({
            success: false,
            message: "accountNo must be a string or null when provided",
          });
        }
        accountNo = body.accountNo.trim() === "" ? undefined : body.accountNo.trim();
      }

      if (body.status !== undefined && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${statusValues}`,
        });
      }

      if (body.rank !== undefined) {
        const r =
          typeof body.rank === "number" && Number.isInteger(body.rank)
            ? body.rank
            : typeof body.rank === "string"
              ? Number.parseInt(body.rank, 10)
              : NaN;
        if (!Number.isFinite(r)) {
          return res.status(400).json({ success: false, message: "rank must be an integer" });
        }
      }

      if (
        body.accountRef !== undefined &&
        body.accountRef !== null &&
        typeof body.accountRef !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "accountRef must be a string or null",
        });
      }

      const created = await accountChartService.create({
        subheadId,
        accountDescription: desc.trim(),
        ...(accountNo !== undefined ? { accountNo } : {}),
        ...(body.accountRef !== undefined ? { accountRef: body.accountRef as string | null } : {}),
        ...(body.status !== undefined ? { status: body.status as Status } : {}),
        ...(body.rank !== undefined
          ? {
              rank:
                typeof body.rank === "number" && Number.isInteger(body.rank)
                  ? body.rank
                  : Number.parseInt(String(body.rank), 10),
            }
          : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Account chart created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (
        message.includes("accountDescription is required") ||
        message.includes("Account number is optional") ||
        message.includes("accountNo cannot be empty")
      ) {
        return res.status(400).json({ success: false, message });
      }
      if (message.includes("not found") || message.includes("Invalid subheadId")) {
        return res.status(404).json({ success: false, message });
      }
      console.error("Error creating account chart:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create account chart",
        error: message,
      });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const groupIdRaw =
        typeof req.query.groupId === "string"
          ? req.query.groupId
          : typeof req.query.groupid === "string"
            ? req.query.groupid
            : undefined;
      const headIdRaw =
        typeof req.query.headId === "string"
          ? req.query.headId
          : typeof req.query.headid === "string"
            ? req.query.headid
            : undefined;
      const subheadIdRaw =
        typeof req.query.subheadId === "string"
          ? req.query.subheadId
          : typeof req.query.subheadid === "string"
            ? req.query.subheadid
            : undefined;

      const groupId = groupIdRaw !== undefined ? parseIntOrUndefined(groupIdRaw) : undefined;
      const headId = headIdRaw !== undefined ? parseIntOrUndefined(headIdRaw) : undefined;
      const subheadId = subheadIdRaw !== undefined ? parseIntOrUndefined(subheadIdRaw) : undefined;

      if (groupIdRaw !== undefined && (groupId === undefined || groupId < 1)) {
        return res.status(400).json({
          success: false,
          message: "groupId must be a positive integer when provided",
        });
      }
      if (headIdRaw !== undefined && (headId === undefined || headId < 1)) {
        return res.status(400).json({
          success: false,
          message: "headId must be a positive integer when provided",
        });
      }
      if (subheadIdRaw !== undefined && (subheadId === undefined || subheadId < 1)) {
        return res.status(400).json({
          success: false,
          message: "subheadId must be a positive integer when provided",
        });
      }

      const statusRaw = req.query.status;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const accountTypeParsed = parseAccountTypeFromQuery(req.query as Record<string, unknown>);
      if (accountTypeParsed.error) {
        return res.status(400).json({ success: false, message: accountTypeParsed.error });
      }

      const rows = await accountChartService.list({
        ...(groupId !== undefined ? { groupId } : {}),
        ...(headId !== undefined ? { headId } : {}),
        ...(subheadId !== undefined ? { subheadId } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(accountTypeParsed.value !== undefined ? { accountType: accountTypeParsed.value } : {}),
      });

      return res.json({
        success: true,
        message: "Account charts retrieved successfully",
        data: { accountCharts: rows, count: rows.length },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error listing account charts:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account charts",
        error: message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/account-charts/{id}:
   *   get:
   *     summary: Get account chart by ID
   *     tags: [AccountCharts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Bad id }
   *       404: { description: Not found }
   *       500: { description: Server error }
   *   put:
   *     summary: Update account chart
   *     description: Do not send groupId or headId; changing subheadId re-derives them.
   *     tags: [AccountCharts]
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
   *               subheadId: { type: integer }
   *               accountDescription: { type: string }
   *               accountNo: { type: string, nullable: true }
   *               accountRef: { type: string, nullable: true }
   *               status: { type: string, enum: [Active, Inactive, Archived] }
   *               rank: { type: integer }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *       409: { description: Duplicate }
   *       500: { description: Server error }
   *   delete:
   *     summary: Delete account chart
   *     tags: [AccountCharts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: Deleted }
   *       404: { description: Not found }
   *       409: { description: Referenced elsewhere }
   *       500: { description: Server error }
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = parsePositiveIntParam(req.params.id);
      if (id === null) {
        return res.status(400).json({
          success: false,
          message: "A positive integer id is required",
        });
      }

      const row = await accountChartService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Account chart not found" });
      }

      return res.json({
        success: true,
        message: "Account chart retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting account chart:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account chart",
        error: message,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const rej = rejectGroupOrHeadInBody(req.body);
      if (rej) {
        return res.status(400).json({ success: false, message: rej });
      }

      const id = parsePositiveIntParam(req.params.id);
      if (id === null) {
        return res.status(400).json({
          success: false,
          message: "A positive integer id is required",
        });
      }

      const body = req.body ?? {};
      const hasSubheadId = body.subheadId !== undefined;
      const hasDesc = body.accountDescription !== undefined;
      const hasAccountNo = body.accountNo !== undefined;
      const hasAccountRef = body.accountRef !== undefined;
      const hasStatus = body.status !== undefined;
      const hasRank = body.rank !== undefined;

      if (!hasSubheadId && !hasDesc && !hasAccountNo && !hasAccountRef && !hasStatus && !hasRank) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      let subheadId: number | undefined;
      if (hasSubheadId) {
        const raw = body.subheadId;
        const n =
          typeof raw === "number" && Number.isInteger(raw)
            ? raw
            : typeof raw === "string"
              ? Number.parseInt(raw, 10)
              : NaN;
        if (!Number.isFinite(n) || n < 1) {
          return res.status(400).json({
            success: false,
            message: "subheadId must be a positive integer when provided",
          });
        }
        subheadId = n;
      }

      if (
        hasDesc &&
        (typeof body.accountDescription !== "string" || !body.accountDescription.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "accountDescription must be a non-empty string when provided",
        });
      }

      if (hasAccountNo && body.accountNo !== null && typeof body.accountNo !== "string") {
        return res.status(400).json({
          success: false,
          message: "accountNo must be a string or null when provided",
        });
      }

      if (hasStatus && !Object.values(Status).includes(body.status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${statusValues}`,
        });
      }

      if (hasRank) {
        const r =
          typeof body.rank === "number" && Number.isInteger(body.rank)
            ? body.rank
            : typeof body.rank === "string"
              ? Number.parseInt(body.rank, 10)
              : NaN;
        if (!Number.isFinite(r)) {
          return res.status(400).json({ success: false, message: "rank must be an integer" });
        }
      }

      if (hasAccountRef && body.accountRef !== null && typeof body.accountRef !== "string") {
        return res.status(400).json({
          success: false,
          message: "accountRef must be a string or null",
        });
      }

      const existing = await accountChartService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Account chart not found" });
      }

      const updated = await accountChartService.update(id, {
        ...(subheadId !== undefined ? { subheadId } : {}),
        ...(hasDesc ? { accountDescription: (body.accountDescription as string).trim() } : {}),
        ...(hasAccountNo
          ? {
              accountNo:
                body.accountNo === null
                  ? null
                  : (body.accountNo as string).trim() === ""
                    ? null
                    : (body.accountNo as string).trim(),
            }
          : {}),
        ...(hasAccountRef ? { accountRef: body.accountRef as string | null } : {}),
        ...(hasStatus ? { status: body.status as Status } : {}),
        ...(hasRank
          ? {
              rank:
                typeof body.rank === "number" && Number.isInteger(body.rank)
                  ? body.rank
                  : Number.parseInt(String(body.rank), 10),
            }
          : {}),
      });

      return res.json({
        success: true,
        message: "Account chart updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (
        message.includes("cannot be empty") ||
        message.includes("Account number is optional") ||
        message.includes("accountNo cannot be empty")
      ) {
        return res.status(400).json({ success: false, message });
      }
      if (message.includes("not found") || message.includes("Invalid subheadId")) {
        return res.status(404).json({ success: false, message });
      }
      console.error("Error updating account chart:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update account chart",
        error: message,
      });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = parsePositiveIntParam(req.params.id);
      if (id === null) {
        return res.status(400).json({
          success: false,
          message: "A positive integer id is required",
        });
      }

      const existing = await accountChartService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Account chart not found" });
      }

      const deleted = await accountChartService.delete(id);
      return res.json({
        success: true,
        message: "Account chart deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("Cannot delete")) {
        return res.status(409).json({ success: false, message });
      }
      if (message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      console.error("Error deleting account chart:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete account chart",
        error: message,
      });
    }
  },
};
