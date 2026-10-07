import { Request, Response } from "express";
import { EmploymentType, Status } from "@prisma/client";
import { salaryChartService } from "../services/salaryChartService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

const EMPLOYMENT_TYPES = Object.values(EmploymentType) as string[];

function parseEmploymentType(raw: unknown): EmploymentType | undefined {
  if (typeof raw !== "string") return undefined;
  return EMPLOYMENT_TYPES.includes(raw) ? (raw as EmploymentType) : undefined;
}

function parseStep(raw: unknown): number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 1) return "invalid";
  return n;
}

function parseAmount(raw: unknown): string | number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
}

function parseComponents(
  raw: unknown
): Array<{ componentId: string; amount: string | number }> | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.length) return "invalid";

  const parsed: Array<{ componentId: string; amount: string | number }> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return "invalid";
    const row = item as Record<string, unknown>;
    const componentId = row.componentId;
    if (typeof componentId !== "string" || !componentId.trim()) return "invalid";
    const amount = parseAmount(row.amount);
    if (amount === undefined || amount === "invalid") return "invalid";
    parsed.push({ componentId: componentId.trim(), amount });
  }
  return parsed;
}

function parseStatusQuery(raw: unknown): Status | "All" | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "All") return "All";
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

function httpStatusForSalaryChartError(message: string): number {
  if (message === "Salary chart not found") return 404;
  if (message.includes("not found") || message.includes("Invalid gradeLevelId")) return 400;
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("must not") ||
    message.includes("Duplicate") ||
    message.includes("invalid") ||
    message.includes("Invalid") ||
    message.includes("One or more")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/salary-charts:
 *   get:
 *     summary: List salary charts (grouped by grade level, step, employment type)
 *     tags: [SalaryCharts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gradeLevelId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: step
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: employmentType
 *         schema:
 *           type: string
 *           enum: [Permanent, Contractual, Casual, Internship, Volunteer, PartTime, Temporary, Seasonal, ProjectBased, Other]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Chart row status; defaults to Active
 *     responses:
 *       200:
 *         description: Grouped salary charts
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const salaryChartController = {
  list: async (req: Request, res: Response) => {
    try {
      const gradeLevelId =
        typeof req.query.gradeLevelId === "string" ? req.query.gradeLevelId : undefined;

      const stepRaw = parseIntOrUndefined(req.query.step);
      if (req.query.step !== undefined && stepRaw === undefined) {
        return res.status(400).json({ success: false, message: "step must be a positive integer" });
      }
      if (stepRaw !== undefined && stepRaw < 1) {
        return res.status(400).json({ success: false, message: "step must be a positive integer" });
      }

      const employmentTypeRaw =
        typeof req.query.employmentType === "string" ? req.query.employmentType : undefined;
      const employmentType = employmentTypeRaw ? parseEmploymentType(employmentTypeRaw) : undefined;
      if (employmentTypeRaw !== undefined && employmentType === undefined) {
        return res.status(400).json({
          success: false,
          message: `employmentType must be one of: ${EMPLOYMENT_TYPES.join(", ")}`,
        });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const result = await salaryChartService.listGrouped({
        ...(gradeLevelId !== undefined ? { gradeLevelId } : {}),
        ...(stepRaw !== undefined ? { step: stepRaw } : {}),
        ...(employmentType !== undefined ? { employmentType } : {}),
        status,
      });

      return res.json({
        success: true,
        message: "Salary charts retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve salary charts",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/salary-charts/upsert:
   *   post:
   *     summary: Upsert salary chart rows for a grade level, step, and employment type
   *     description: Creates or updates amount rows for each salary component in components. Rows for the same gradeLevelId, step, and employmentType whose componentId is not in the payload are removed.
   *     tags: [SalaryCharts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [gradeLevelId, step, employmentType, components]
   *             properties:
   *               gradeLevelId:
   *                 type: string
   *                 format: uuid
   *               step:
   *                 type: integer
   *                 minimum: 1
   *                 example: 1
   *               employmentType:
   *                 type: string
   *                 enum: [Permanent, Contractual, Casual, Internship, Volunteer, PartTime, Temporary, Seasonal, ProjectBased, Other]
   *               components:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [componentId, amount]
   *                   properties:
   *                     componentId:
   *                       type: string
   *                       format: uuid
   *                     amount:
   *                       type: number
   *     responses:
   *       200:
   *         description: Salary chart upserted
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  upsert: async (req: Request, res: Response) => {
    try {
      const userId = (req as { user?: { id: string } }).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { gradeLevelId, step, employmentType, components } = body;

      if (!gradeLevelId || typeof gradeLevelId !== "string" || !gradeLevelId.trim()) {
        return res.status(400).json({ success: false, message: "gradeLevelId is required" });
      }

      const parsedStep = parseStep(step);
      if (parsedStep === undefined || parsedStep === "invalid") {
        return res.status(400).json({ success: false, message: "step must be a positive integer" });
      }

      const parsedEmploymentType = parseEmploymentType(employmentType);
      if (!parsedEmploymentType) {
        return res.status(400).json({
          success: false,
          message: `employmentType must be one of: ${EMPLOYMENT_TYPES.join(", ")}`,
        });
      }

      const parsedComponents = parseComponents(components);
      if (parsedComponents === undefined || parsedComponents === "invalid") {
        return res.status(400).json({
          success: false,
          message: "components must be a non-empty array of { componentId, amount }",
        });
      }

      const result = await salaryChartService.upsertChart({
        gradeLevelId: gradeLevelId.trim(),
        step: parsedStep,
        employmentType: parsedEmploymentType,
        components: parsedComponents,
        userId,
      });

      return res.json({
        success: true,
        message: "Salary chart upserted successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upsert salary chart";
      return res.status(httpStatusForSalaryChartError(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/salary-charts/{id}:
   *   get:
   *     summary: Get salary chart by row id
   *     description: >
   *       Returns the full chart slot (gradeLevelId, step, employmentType) for the row identified by `id`,
   *       including all component amounts in that slot with grade level and component details.
   *     tags: [SalaryCharts]
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
   *         description: Grouped salary chart
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const chart = await salaryChartService.getGroupedById(id);
      if (!chart) {
        return res.status(404).json({ success: false, message: "Salary chart not found" });
      }

      return res.json({
        success: true,
        message: "Salary chart retrieved successfully",
        data: chart,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve salary chart",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },
};
