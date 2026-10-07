import { Request, Response } from "express";
import { SalaryComponentType, Status } from "@prisma/client";
import { salaryComponentService } from "../services/salaryComponentService";
import { isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";

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

function parseType(raw: unknown): SalaryComponentType | undefined {
  if (raw === SalaryComponentType.EARNING || raw === SalaryComponentType.DEDUCTION) {
    return raw;
  }
  return undefined;
}

function parseBooleanQuery(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "invalid";
}

function parseOptionalBoolean(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  return "invalid";
}

function parseFunctionElements(raw: unknown): string[] | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) return "invalid";
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) return "invalid";
    ids.push(item.trim());
  }
  return ids;
}

function parseFunctionPercentage(raw: unknown): string | number | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
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

function parseBodyRank(raw: unknown): number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

function httpStatusForSalaryComponentError(message: string): number {
  if (message === "Salary component not found") return 404;
  if (message.includes("already exists")) return 409;
  if (message.includes("Cannot delete")) return 409;
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("cannot") ||
    message.includes("invalid") ||
    message.includes("Invalid")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/salary-components:
 *   post:
 *     summary: Create a salary component
 *     tags: [SalaryComponents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:
 *                 type: string
 *               shortName:
 *                 type: string
 *                 nullable: true
 *               type:
 *                 type: string
 *                 enum: [EARNING, DEDUCTION]
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               isTaxable:
 *                 type: boolean
 *               isPensionable:
 *                 type: boolean
 *               isStatutory:
 *                 type: boolean
 *               isFunction:
 *                 type: boolean
 *                 description: When true, functionPercentage and functionElements are required
 *               functionPercentage:
 *                 oneOf: [{ type: string }, { type: number }]
 *               functionElements:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: IDs of base salary components included in the function
 *               accountId:
 *                 type: integer
 *                 nullable: true
 *                 description: Linked account chart id for payroll posting
 *               rank:
 *                 type: integer
 *                 minimum: 0
 *                 description: Sort order (lower first)
 *     responses:
 *       201:
 *         description: Salary component created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List salary components
 *     tags: [SalaryComponents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search name or shortName (substring)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [EARNING, DEDUCTION]
 *       - in: query
 *         name: isFunction
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by linked account chart id
 *     responses:
 *       200:
 *         description: Salary components list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const salaryComponentController = {
  create: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const {
        name,
        shortName,
        type,
        status,
        isTaxable,
        isPensionable,
        isStatutory,
        isFunction,
        functionPercentage,
        functionElements,
        accountId,
        rank,
      } = body;

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      if (shortName !== undefined && !isStringOrNullOrUndefined(shortName)) {
        return res.status(400).json({ success: false, message: "shortName must be a string or null" });
      }

      const parsedAccountId = parseBodyAccountId(accountId);
      if (parsedAccountId === "invalid") {
        return res.status(400).json({
          success: false,
          message: "accountId must be a positive integer or null",
        });
      }

      const parsedRank = parseBodyRank(rank);
      if (parsedRank === "invalid") {
        return res.status(400).json({ success: false, message: "rank must be a non-negative integer" });
      }

      const parsedType = parseType(type);
      if (!parsedType) {
        return res.status(400).json({ success: false, message: "type must be EARNING or DEDUCTION" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const parsedIsFunction = parseOptionalBoolean(isFunction);
      if (parsedIsFunction === "invalid") {
        return res.status(400).json({ success: false, message: "isFunction must be a boolean" });
      }

      const parsedIsTaxable = parseOptionalBoolean(isTaxable);
      if (parsedIsTaxable === "invalid") {
        return res.status(400).json({ success: false, message: "isTaxable must be a boolean" });
      }

      const parsedIsPensionable = parseOptionalBoolean(isPensionable);
      if (parsedIsPensionable === "invalid") {
        return res.status(400).json({ success: false, message: "isPensionable must be a boolean" });
      }

      const parsedIsStatutory = parseOptionalBoolean(isStatutory);
      if (parsedIsStatutory === "invalid") {
        return res.status(400).json({ success: false, message: "isStatutory must be a boolean" });
      }

      const parsedFunctionPct = parseFunctionPercentage(functionPercentage);
      if (parsedFunctionPct === "invalid") {
        return res
          .status(400)
          .json({ success: false, message: "functionPercentage must be a number or numeric string" });
      }

      const parsedElements = parseFunctionElements(functionElements);
      if (parsedElements === "invalid") {
        return res.status(400).json({
          success: false,
          message: "functionElements must be an array of non-empty component id strings",
        });
      }

      const created = await salaryComponentService.create({
        name: name.trim(),
        type: parsedType,
        ...(shortName !== undefined
          ? { shortName: shortName === "" ? null : (shortName as string | null) }
          : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedIsTaxable !== undefined ? { isTaxable: parsedIsTaxable } : {}),
        ...(parsedIsPensionable !== undefined ? { isPensionable: parsedIsPensionable } : {}),
        ...(parsedIsStatutory !== undefined ? { isStatutory: parsedIsStatutory } : {}),
        ...(parsedIsFunction !== undefined ? { isFunction: parsedIsFunction } : {}),
        ...(parsedFunctionPct !== undefined ? { functionPercentage: parsedFunctionPct } : {}),
        ...(parsedElements !== undefined ? { functionElements: parsedElements } : {}),
        ...(parsedAccountId !== undefined ? { accountId: parsedAccountId } : {}),
        ...(parsedRank !== undefined ? { rank: parsedRank } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Salary component created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create salary component";
      return res.status(httpStatusForSalaryComponentError(message)).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const typeRaw = typeof req.query.type === "string" ? req.query.type : undefined;
      const type = typeRaw ? parseType(typeRaw) : undefined;
      if (typeRaw !== undefined && type === undefined) {
        return res.status(400).json({ success: false, message: "type must be EARNING or DEDUCTION" });
      }

      const isFunctionRaw = parseBooleanQuery(req.query.isFunction);
      if (isFunctionRaw === "invalid") {
        return res.status(400).json({ success: false, message: "isFunction must be true or false" });
      }

      const accountId = parseIntOrUndefined(req.query.accountId);
      if (req.query.accountId !== undefined && accountId === undefined) {
        return res.status(400).json({
          success: false,
          message: "accountId must be a positive integer",
        });
      }

      const result = await salaryComponentService.list({
        q,
        status,
        ...(type !== undefined ? { type } : {}),
        ...(isFunctionRaw !== undefined ? { isFunction: isFunctionRaw } : {}),
        ...(accountId !== undefined ? { accountId } : {}),
      });

      return res.json({
        success: true,
        message: "Salary components retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve salary components",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/salary-components/{id}:
   *   get:
   *     summary: Get salary component by ID
   *     tags: [SalaryComponents]
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
   *         description: Salary component details
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update salary component
   *     tags: [SalaryComponents]
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
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               shortName:
   *                 type: string
   *                 nullable: true
   *               type:
   *                 type: string
   *                 enum: [EARNING, DEDUCTION]
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *               isTaxable:
   *                 type: boolean
   *               isPensionable:
   *                 type: boolean
   *               isStatutory:
   *                 type: boolean
   *               isFunction:
   *                 type: boolean
   *               functionPercentage:
   *                 oneOf: [{ type: string }, { type: number }, { type: "null" }]
 *               functionElements:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               accountId:
 *                 type: integer
 *                 nullable: true
 *                 description: Linked account chart id; send null to clear
 *               rank:
 *                 type: integer
 *                 minimum: 0
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
   *     summary: Delete salary component
   *     tags: [SalaryComponents]
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
   *         description: Referenced by salary charts
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await salaryComponentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Salary component not found" });
      }

      return res.json({
        success: true,
        message: "Salary component retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve salary component",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const {
        name,
        shortName,
        type,
        status,
        isTaxable,
        isPensionable,
        isStatutory,
        isFunction,
        functionPercentage,
        functionElements,
        accountId,
        rank,
      } = body;

      const hasAny =
        name !== undefined ||
        shortName !== undefined ||
        type !== undefined ||
        status !== undefined ||
        isTaxable !== undefined ||
        isPensionable !== undefined ||
        isStatutory !== undefined ||
        isFunction !== undefined ||
        functionPercentage !== undefined ||
        functionElements !== undefined ||
        accountId !== undefined ||
        rank !== undefined;

      if (!hasAny) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      if (shortName !== undefined && !isStringOrNullOrUndefined(shortName)) {
        return res.status(400).json({ success: false, message: "shortName must be a string or null" });
      }

      const parsedType = type !== undefined ? parseType(type) : undefined;
      if (type !== undefined && parsedType === undefined) {
        return res.status(400).json({ success: false, message: "type must be EARNING or DEDUCTION" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const parsedIsFunction = parseOptionalBoolean(isFunction);
      if (parsedIsFunction === "invalid") {
        return res.status(400).json({ success: false, message: "isFunction must be a boolean" });
      }

      const parsedIsTaxable = parseOptionalBoolean(isTaxable);
      if (parsedIsTaxable === "invalid") {
        return res.status(400).json({ success: false, message: "isTaxable must be a boolean" });
      }

      const parsedIsPensionable = parseOptionalBoolean(isPensionable);
      if (parsedIsPensionable === "invalid") {
        return res.status(400).json({ success: false, message: "isPensionable must be a boolean" });
      }

      const parsedIsStatutory = parseOptionalBoolean(isStatutory);
      if (parsedIsStatutory === "invalid") {
        return res.status(400).json({ success: false, message: "isStatutory must be a boolean" });
      }

      const parsedFunctionPct = parseFunctionPercentage(functionPercentage);
      if (parsedFunctionPct === "invalid") {
        return res
          .status(400)
          .json({ success: false, message: "functionPercentage must be a number or numeric string" });
      }

      const parsedElements = parseFunctionElements(functionElements);
      if (parsedElements === "invalid") {
        return res.status(400).json({
          success: false,
          message: "functionElements must be an array of non-empty component id strings",
        });
      }

      const parsedAccountId = parseBodyAccountId(accountId);
      if (parsedAccountId === "invalid") {
        return res.status(400).json({
          success: false,
          message: "accountId must be a positive integer or null",
        });
      }

      const parsedRank = parseBodyRank(rank);
      if (parsedRank === "invalid") {
        return res.status(400).json({ success: false, message: "rank must be a non-negative integer" });
      }

      const updated = await salaryComponentService.update(id, {
        ...(name !== undefined ? { name: name as string } : {}),
        ...(shortName !== undefined
          ? { shortName: shortName === "" ? null : (shortName as string | null) }
          : {}),
        ...(parsedType !== undefined ? { type: parsedType } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedIsTaxable !== undefined ? { isTaxable: parsedIsTaxable } : {}),
        ...(parsedIsPensionable !== undefined ? { isPensionable: parsedIsPensionable } : {}),
        ...(parsedIsStatutory !== undefined ? { isStatutory: parsedIsStatutory } : {}),
        ...(parsedIsFunction !== undefined ? { isFunction: parsedIsFunction } : {}),
        ...(parsedFunctionPct !== undefined ? { functionPercentage: parsedFunctionPct } : {}),
        ...(parsedElements !== undefined ? { functionElements: parsedElements } : {}),
        ...(parsedAccountId !== undefined ? { accountId: parsedAccountId } : {}),
        ...(parsedRank !== undefined ? { rank: parsedRank } : {}),
      });

      return res.json({
        success: true,
        message: "Salary component updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update salary component";
      return res.status(httpStatusForSalaryComponentError(message)).json({ success: false, message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await salaryComponentService.delete(id);

      return res.json({
        success: true,
        message: "Salary component deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete salary component";
      return res.status(httpStatusForSalaryComponentError(message)).json({ success: false, message });
    }
  },
};
