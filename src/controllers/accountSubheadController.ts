import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { accountSubheadService } from "../services/accountSubheadService";
import { parseAccountTypeFromBody, parseAccountTypeFromQuery } from "../utils/accountType";
import { parseIntOrUndefined, parsePositiveIntParam } from "../utils/request";

function rejectGroupIdInBody(body: unknown): string | null {
  if (body !== null && typeof body === "object") {
    if ("groupId" in body) {
      return "groupId must not be sent in the request body; it is resolved from headId";
    }
    if ("group_id" in body) {
      return "group_id must not be sent in the request body; it is resolved from headId";
    }
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
 * /api/v1/account-subheads:
 *   post:
 *     summary: Create an account subhead
 *     description: |
 *       Creates a subhead under an account head. **Do not send `groupId`** — it is set from the head's `groupId`.
 *     tags: [AccountSubheads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [headId, name]
 *             properties:
 *               headId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Parent account head (group is derived from this head)
 *               code:
 *                 type: string
 *                 nullable: true
 *                 description: Optional; must be globally unique when set. Omit or null to leave unset.
 *               name:
 *                 type: string
 *                 description: Required; unique per account head (same headId).
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Defaults to Active
 *               rank:
 *                 type: integer
 *                 description: Defaults to 0
 *               afs:
 *                 type: string
 *                 nullable: true
 *               paymentMethod:
 *                 type: string
 *                 nullable: true
 *               accountType:
 *                 type: string
 *                 enum: [Cash, NonCash]
 *                 description: Account type (stored as accountType / account_type). Defaults to Cash. Alias body field accountType is also accepted.
 *     responses:
 *       201:
 *         description: Subhead created
 *       400:
 *         description: Validation error (including if groupId is sent)
 *       404:
 *         description: Account head not found (invalid headId)
 *       409:
 *         description: Duplicate name for this head or duplicate code globally
 *       500:
 *         description: Server error
 *   get:
 *     summary: List account subheads
 *     tags: [AccountSubheads]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by account group
 *       - in: query
 *         name: headId
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by account head
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only; use All for every status
 *       - in: query
 *         name: accountType
 *         schema:
 *           type: string
 *           enum: [Cash, NonCash]
 *         description: Filter by subhead account type. Alias query param accountType is also accepted.
 *     responses:
 *       200:
 *         description: List of subheads with group and head
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const accountSubheadController = {
  create: async (req: Request, res: Response) => {
    try {
      const groupErr = rejectGroupIdInBody(req.body);
      if (groupErr) {
        return res.status(400).json({ success: false, message: groupErr });
      }

      const body = req.body ?? {};
      const headId =
        typeof body.headId === "number" && Number.isInteger(body.headId)
          ? body.headId
          : typeof body.headId === "string"
            ? Number.parseInt(body.headId, 10)
            : NaN;

      if (!Number.isFinite(headId) || headId < 1) {
        return res.status(400).json({
          success: false,
          message: "headId is required and must be a positive integer",
        });
      }

      const { name } = body;
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      let codeArg: string | null | undefined;
      if (body.code !== undefined && body.code !== null) {
        if (typeof body.code !== "string") {
          return res.status(400).json({
            success: false,
            message: "code must be a string when provided",
          });
        }
        codeArg = body.code.trim() === "" ? undefined : body.code.trim();
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

      if (body.afs !== undefined && body.afs !== null && typeof body.afs !== "string") {
        return res.status(400).json({ success: false, message: "afs must be a string or null" });
      }
      if (
        body.paymentMethod !== undefined &&
        body.paymentMethod !== null &&
        typeof body.paymentMethod !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "paymentMethod must be a string or null",
        });
      }

      const createAccountType = parseAccountTypeFromBody(body as Record<string, unknown>);
      if (createAccountType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "accountType must be one of: Cash, NonCash",
        });
      }

      const created = await accountSubheadService.create({
        headId,
        name: name.trim(),
        ...(codeArg !== undefined ? { code: codeArg } : {}),
        ...(body.status !== undefined ? { status: body.status as Status } : {}),
        ...(body.rank !== undefined
          ? {
              rank:
                typeof body.rank === "number" && Number.isInteger(body.rank)
                  ? body.rank
                  : Number.parseInt(String(body.rank), 10),
            }
          : {}),
        ...(body.afs !== undefined ? { afs: body.afs } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
        ...(createAccountType !== undefined ? { accountType: createAccountType } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Account subhead created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (message.includes("name is required")) {
        return res.status(400).json({ success: false, message });
      }
      if (message.includes("Invalid headId") || message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      console.error("Error creating account subhead:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create account subhead",
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

      const groupId = groupIdRaw !== undefined ? parseIntOrUndefined(groupIdRaw) : undefined;
      const headId = headIdRaw !== undefined ? parseIntOrUndefined(headIdRaw) : undefined;

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

      const statusRaw = req.query.status;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: `status must be Active, Inactive, Archived, or All`,
        });
      }

      const accountTypeParsed = parseAccountTypeFromQuery(req.query as Record<string, unknown>);
      if (accountTypeParsed.error) {
        return res.status(400).json({ success: false, message: accountTypeParsed.error });
      }

      const rows = await accountSubheadService.list({
        ...(groupId !== undefined ? { groupId } : {}),
        ...(headId !== undefined ? { headId } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(accountTypeParsed.value !== undefined ? { accountType: accountTypeParsed.value } : {}),
      });

      return res.json({
        success: true,
        message: "Account subheads retrieved successfully",
        data: { accountSubheads: rows, count: rows.length },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error listing account subheads:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account subheads",
        error: message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/account-subheads/{id}:
   *   get:
   *     summary: Get an account subhead by ID
   *     tags: [AccountSubheads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Subhead with group and head
   *       400:
   *         description: Invalid id
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update an account subhead
   *     description: |
   *       Partial update. **Do not send `groupId`** — if `headId` is sent, `groupId` is updated from that head.
   *     tags: [AccountSubheads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               headId:
   *                 type: integer
   *                 minimum: 1
   *               code:
   *                 type: string
   *                 nullable: true
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *               rank:
   *                 type: integer
   *               afs:
   *                 type: string
   *                 nullable: true
   *               paymentMethod:
   *                 type: string
   *                 nullable: true
   *               accountType:
   *                 type: string
   *                 enum: [Cash, NonCash]
   *                 description: Account type (stored as accountType). Alias body field accountType is also accepted.
   *     responses:
   *       200:
   *         description: Updated subhead
   *       400:
   *         description: Validation error or no fields to update
   *       404:
   *         description: Subhead or head not found
   *       409:
   *         description: Duplicate name for this head or duplicate code globally
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete an account subhead
   *     tags: [AccountSubheads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *     responses:
   *       200:
   *         description: Deleted subhead
   *       400:
   *         description: Invalid id
   *       404:
   *         description: Not found
   *       409:
   *         description: Referenced by charts or transactions
   *       500:
   *         description: Server error
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

      const row = await accountSubheadService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Account subhead not found" });
      }

      return res.json({
        success: true,
        message: "Account subhead retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting account subhead:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account subhead",
        error: message,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const groupErr = rejectGroupIdInBody(req.body);
      if (groupErr) {
        return res.status(400).json({ success: false, message: groupErr });
      }

      const id = parsePositiveIntParam(req.params.id);
      if (id === null) {
        return res.status(400).json({
          success: false,
          message: "A positive integer id is required",
        });
      }

      const body = req.body ?? {};
      const hasHeadId = body.headId !== undefined;
      const hasCode = body.code !== undefined;
      const hasName = body.name !== undefined;
      const hasStatus = body.status !== undefined;
      const hasRank = body.rank !== undefined;
      const hasAfs = body.afs !== undefined;
      const hasPaymentMethod = body.paymentMethod !== undefined;
      const hasAccountType = body.accountType !== undefined || body.accountType !== undefined;

      if (
        !hasHeadId &&
        !hasCode &&
        !hasName &&
        !hasStatus &&
        !hasRank &&
        !hasAfs &&
        !hasPaymentMethod &&
        !hasAccountType
      ) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      let headId: number | undefined;
      if (hasHeadId) {
        const raw = body.headId;
        const n =
          typeof raw === "number" && Number.isInteger(raw)
            ? raw
            : typeof raw === "string"
              ? Number.parseInt(raw, 10)
              : NaN;
        if (!Number.isFinite(n) || n < 1) {
          return res.status(400).json({
            success: false,
            message: "headId must be a positive integer when provided",
          });
        }
        headId = n;
      }

      if (hasCode && body.code !== null && typeof body.code !== "string") {
        return res.status(400).json({
          success: false,
          message: "code must be a string or null when provided",
        });
      }
      if (hasName && (typeof body.name !== "string" || !body.name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
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
      if (hasAfs && body.afs !== null && typeof body.afs !== "string") {
        return res.status(400).json({ success: false, message: "afs must be a string or null" });
      }
      if (
        hasPaymentMethod &&
        body.paymentMethod !== null &&
        typeof body.paymentMethod !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "paymentMethod must be a string or null",
        });
      }
      const updateAccountType = hasAccountType
        ? parseAccountTypeFromBody(body as Record<string, unknown>)
        : undefined;
      if (updateAccountType === "invalid") {
        return res.status(400).json({
          success: false,
          message: "accountType must be one of: Cash, NonCash",
        });
      }

      const existing = await accountSubheadService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Account subhead not found" });
      }

      const updated = await accountSubheadService.update(id, {
        ...(headId !== undefined ? { headId } : {}),
        ...(hasCode
          ? {
              code:
                body.code === null
                  ? null
                  : (body.code as string).trim() === ""
                    ? null
                    : (body.code as string).trim(),
            }
          : {}),
        ...(hasName ? { name: (body.name as string).trim() } : {}),
        ...(hasStatus ? { status: body.status as Status } : {}),
        ...(hasRank
          ? {
              rank:
                typeof body.rank === "number" && Number.isInteger(body.rank)
                  ? body.rank
                  : Number.parseInt(String(body.rank), 10),
            }
          : {}),
        ...(hasAfs ? { afs: body.afs as string | null } : {}),
        ...(hasPaymentMethod ? { paymentMethod: body.paymentMethod as string | null } : {}),
        ...(updateAccountType !== undefined ? { accountType: updateAccountType } : {}),
      });

      return res.json({
        success: true,
        message: "Account subhead updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (message.includes("code cannot be empty")) {
        return res.status(400).json({ success: false, message });
      }
      if (message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      console.error("Error updating account subhead:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update account subhead",
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

      const existing = await accountSubheadService.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Account subhead not found" });
      }

      const deleted = await accountSubheadService.delete(id);
      return res.json({
        success: true,
        message: "Account subhead deleted successfully",
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
      console.error("Error deleting account subhead:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete account subhead",
        error: message,
      });
    }
  },
};
