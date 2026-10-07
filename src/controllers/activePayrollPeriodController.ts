import { Request, Response } from "express";
import { activePayrollPeriodService } from "../services/activePayrollPeriodService";

function parseYearMonth(rawYear: unknown, rawMonth: unknown): { year: number; month: number } | null {
  const year =
    typeof rawYear === "number" && Number.isInteger(rawYear)
      ? rawYear
      : typeof rawYear === "string"
        ? Number.parseInt(rawYear, 10)
        : NaN;
  const month =
    typeof rawMonth === "number" && Number.isInteger(rawMonth)
      ? rawMonth
      : typeof rawMonth === "string"
        ? Number.parseInt(rawMonth, 10)
        : NaN;

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

/**
 * @openapi
 * /api/v1/active-payroll-period:
 *   get:
 *     summary: Get active payroll period (singleton)
 *     tags: [ActivePayrollPeriod]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active payroll period record (or null if not set)
 *       500:
 *         description: Server error
 *   put:
 *     summary: Upsert active payroll period (singleton)
 *     tags: [ActivePayrollPeriod]
 *     security:
 *       - bearerAuth: []
 *     description: Creates the record if missing, otherwise updates it. Only one row is kept in the table.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, month]
 *             properties:
 *               year:
 *                 type: integer
 *                 minimum: 1900
 *                 maximum: 2100
 *                 example: 2026
 *               month:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *                 example: 6
 *     responses:
 *       200:
 *         description: Active payroll period saved
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const activePayrollPeriodController = {
  getActivePayrollPeriod: async (_req: Request, res: Response) => {
    try {
      const record = await activePayrollPeriodService.getActivePayrollPeriod();
      return res.json({
        success: true,
        message: "Active payroll period retrieved successfully",
        data: record,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve active payroll period",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  upsertActivePayrollPeriod: async (req: Request, res: Response) => {
    try {
      const { year, month } = req.body ?? {};
      const parsed = parseYearMonth(year, month);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "year and month are required and must be integers",
        });
      }

      const saved = await activePayrollPeriodService.upsertActivePayrollPeriod(parsed);

      return res.json({
        success: true,
        message: "Active payroll period saved successfully",
        data: saved,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save active payroll period";
      const status =
        message.includes("must be") || message.includes("required") ? 400 : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
