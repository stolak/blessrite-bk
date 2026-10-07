import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { administrativeExpenseComponentService } from "../services/administrativeExpenseComponentService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

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

function parseBodyAccountId(raw: unknown): number | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 1) return "invalid";
  return n;
}

/**
 * @openapi
 * /api/v1/administrative-expense-components:
 *   post:
 *     summary: Create an administrative expense component
 *     tags: [AdministrativeExpenseComponents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               accountId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Component created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List administrative expense components
 *     tags: [AdministrativeExpenseComponents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Components list
 *       400:
 *         description: Invalid query
 *       500:
 *         description: Server error
 */
export const administrativeExpenseComponentController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, status, accountId } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      let accountIdInput: number | null | undefined;
      if (accountId !== undefined) {
        const parsedAccountId = parseBodyAccountId(accountId);
        if (parsedAccountId === "invalid") {
          return res.status(400).json({
            success: false,
            message: "accountId must be a positive integer or null",
          });
        }
        accountIdInput = parsedAccountId;
      }

      const created = await administrativeExpenseComponentService.create({
        name: name.trim(),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(accountIdInput !== undefined ? { accountId: accountIdInput } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Administrative expense component created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create administrative expense component";
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (
        message.includes("name is required") ||
        message.includes("accountId") ||
        message.includes("account chart")
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
      const accountId = parseIntOrUndefined(req.query.accountId);

      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const result = await administrativeExpenseComponentService.list({ q, status, accountId });

      return res.json({
        success: true,
        message: "Administrative expense components retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve administrative expense components",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/administrative-expense-components/{id}:
   *   get:
   *     summary: Get an administrative expense component by ID
   *     tags: [AdministrativeExpenseComponents]
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
   *         description: Component details
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update an administrative expense component
   *     tags: [AdministrativeExpenseComponents]
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
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *               accountId:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Duplicate name
   *   delete:
   *     summary: Delete an administrative expense component
   *     tags: [AdministrativeExpenseComponents]
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
   *       409:
   *         description: Referenced by expenses
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const row = await administrativeExpenseComponentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Administrative expense component not found" });
      }

      return res.json({
        success: true,
        message: "Administrative expense component retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve administrative expense component",
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

      const { name, status, accountId } = req.body ?? {};

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      let accountIdInput: number | null | undefined;
      if (accountId !== undefined) {
        const parsedAccountId = parseBodyAccountId(accountId);
        if (parsedAccountId === "invalid") {
          return res.status(400).json({
            success: false,
            message: "accountId must be a positive integer or null",
          });
        }
        accountIdInput = parsedAccountId;
      }

      const updated = await administrativeExpenseComponentService.update(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(accountIdInput !== undefined ? { accountId: accountIdInput } : {}),
      });

      return res.json({
        success: true,
        message: "Administrative expense component updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update administrative expense component";
      if (message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      if (message.includes("already exists")) {
        return res.status(409).json({ success: false, message });
      }
      if (
        message.includes("cannot be empty") ||
        message.includes("accountId") ||
        message.includes("account chart")
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

      const deleted = await administrativeExpenseComponentService.delete(id);

      return res.json({
        success: true,
        message: "Administrative expense component deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to delete administrative expense component";
      if (message.includes("not found")) {
        return res.status(404).json({ success: false, message });
      }
      if (message.includes("Cannot delete") || message.includes("referenced")) {
        return res.status(409).json({ success: false, message });
      }
      return res.status(500).json({ success: false, message });
    }
  },
};
