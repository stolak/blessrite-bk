import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { staffSalaryOverrideComponentService } from "../services/staffSalaryOverrideComponentService";
import { routeParam } from "../utils/request";

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

function parseOptionalBoolean(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  return "invalid";
}

function parseDecimalInput(raw: unknown): string | number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return "invalid";
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
}

function parseNullableDecimalInput(raw: unknown): string | number | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
}

function httpStatusForOverrideError(message: string): number {
  if (
    message === "Staff salary override component not found" ||
    message === "Invalid staffId" ||
    message === "Invalid componentId"
  ) {
    return message === "Staff salary override component not found" ? 404 : 404;
  }
  if (message.includes("Cannot delete")) return 409;
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("invalid") ||
    message.includes("Invalid") ||
    message.includes("Duplicate")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/staff-salary-override-components:
 *   post:
 *     summary: Create a staff salary override component
 *     tags: [StaffSalaryOverrideComponents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, componentId, amount]
 *             properties:
 *               staffId: { type: string, format: uuid }
 *               componentId: { type: string, format: uuid }
 *               amount:
 *                 oneOf: [{ type: string }, { type: number }]
 *               isContinuous: { type: boolean, default: false }
 *               targetAmount:
 *                 oneOf: [{ type: string }, { type: number }, { type: "null" }]
 *               status: { type: string, enum: [Active, Inactive, Archived] }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       404: { description: Staff or component not found }
 *       500: { description: Server error }
 *   get:
 *     summary: List staff salary override components
 *     tags: [StaffSalaryOverrideComponents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: componentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive, Archived, All] }
 *         description: Defaults to Active only
 *     responses:
 *       200: { description: List }
 *       400: { description: Invalid query parameters }
 *       500: { description: Server error }
 */
export const staffSalaryOverrideComponentController = {
  create: async (req: Request, res: Response) => {
    try {
      const userId = (req as { user?: { id: string } }).user?.id ?? null;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { staffId, componentId, amount, isContinuous, targetAmount, status } = body;

      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!componentId || typeof componentId !== "string" || !componentId.trim()) {
        return res.status(400).json({ success: false, message: "componentId is required" });
      }

      const parsedAmount = parseDecimalInput(amount);
      if (parsedAmount === undefined || parsedAmount === "invalid") {
        return res.status(400).json({ success: false, message: "amount must be a number or numeric string" });
      }

      const parsedIsContinuous = parseOptionalBoolean(isContinuous);
      if (parsedIsContinuous === "invalid") {
        return res.status(400).json({ success: false, message: "isContinuous must be a boolean" });
      }

      const parsedTargetAmount = parseNullableDecimalInput(targetAmount);
      if (parsedTargetAmount === "invalid") {
        return res
          .status(400)
          .json({ success: false, message: "targetAmount must be a number, numeric string, or null" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const created = await staffSalaryOverrideComponentService.create({
        staffId: staffId.trim(),
        componentId: componentId.trim(),
        amount: parsedAmount,
        ...(parsedIsContinuous !== undefined ? { isContinuous: parsedIsContinuous } : {}),
        ...(parsedTargetAmount !== undefined ? { targetAmount: parsedTargetAmount } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        createdBy: userId,
      });

      return res.status(201).json({
        success: true,
        message: "Staff salary override component created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create staff salary override component";
      return res.status(httpStatusForOverrideError(message)).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
      const componentId = typeof req.query.componentId === "string" ? req.query.componentId : undefined;

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const result = await staffSalaryOverrideComponentService.list({
        ...(staffId !== undefined ? { staffId } : {}),
        ...(componentId !== undefined ? { componentId } : {}),
        status,
      });

      return res.json({
        success: true,
        message: "Staff salary override components retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff salary override components",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-salary-override-components/{id}:
   *   get:
   *     summary: Get staff salary override component by ID
   *     tags: [StaffSalaryOverrideComponents]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Details }
   *       404: { description: Not found }
   *   put:
   *     summary: Update staff salary override component
   *     tags: [StaffSalaryOverrideComponents]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               staffId: { type: string, format: uuid }
   *               componentId: { type: string, format: uuid }
   *               amount:
   *                 oneOf: [{ type: string }, { type: number }]
   *               isContinuous: { type: boolean }
   *               targetAmount:
   *                 oneOf: [{ type: string }, { type: number }, { type: "null" }]
   *               status: { type: string, enum: [Active, Inactive, Archived] }
   *     responses:
   *       200: { description: Updated }
   *       400: { description: Validation error }
   *       404: { description: Not found }
   *   delete:
   *     summary: Delete staff salary override component
   *     tags: [StaffSalaryOverrideComponents]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Deleted }
   *       404: { description: Not found }
   *       409: { description: Referenced by staff salary process overrides }
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await staffSalaryOverrideComponentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Staff salary override component not found" });
      }

      return res.json({
        success: true,
        message: "Staff salary override component retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff salary override component",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { staffId, componentId, amount, isContinuous, targetAmount, status } = body;

      const hasAny =
        staffId !== undefined ||
        componentId !== undefined ||
        amount !== undefined ||
        isContinuous !== undefined ||
        targetAmount !== undefined ||
        status !== undefined;

      if (!hasAny) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      if (staffId !== undefined && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string" });
      }
      if (componentId !== undefined && (typeof componentId !== "string" || !componentId.trim())) {
        return res.status(400).json({ success: false, message: "componentId must be a non-empty string" });
      }

      const parsedAmount = parseDecimalInput(amount);
      if (amount !== undefined && (parsedAmount === undefined || parsedAmount === "invalid")) {
        return res.status(400).json({ success: false, message: "amount must be a number or numeric string" });
      }

      const parsedIsContinuous = parseOptionalBoolean(isContinuous);
      if (parsedIsContinuous === "invalid") {
        return res.status(400).json({ success: false, message: "isContinuous must be a boolean" });
      }

      const parsedTargetAmount = parseNullableDecimalInput(targetAmount);
      if (parsedTargetAmount === "invalid") {
        return res
          .status(400)
          .json({ success: false, message: "targetAmount must be a number, numeric string, or null" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const updated = await staffSalaryOverrideComponentService.update(id, {
        ...(staffId !== undefined ? { staffId: staffId as string } : {}),
        ...(componentId !== undefined ? { componentId: componentId as string } : {}),
        ...(parsedAmount !== undefined && parsedAmount !== "invalid" ? { amount: parsedAmount } : {}),
        ...(parsedIsContinuous !== undefined ? { isContinuous: parsedIsContinuous } : {}),
        ...(parsedTargetAmount !== undefined ? { targetAmount: parsedTargetAmount } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Staff salary override component updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update staff salary override component";
      return res.status(httpStatusForOverrideError(message)).json({ success: false, message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await staffSalaryOverrideComponentService.delete(id);

      return res.json({
        success: true,
        message: "Staff salary override component deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to delete staff salary override component";
      return res.status(httpStatusForOverrideError(message)).json({ success: false, message });
    }
  },
};

