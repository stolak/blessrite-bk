import { Request, Response } from "express";
import { activePeriodService } from "../services/activePeriodService";

function parseIsoDateRequired(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @openapi
 * /api/v1/active-period:
 *   get:
 *     summary: Get active period (singleton)
 *     tags: [ActivePeriod]
 *     responses:
 *       200:
 *         description: Active period record (or null if not set)
 *       500:
 *         description: Server error
 *   put:
 *     summary: Upsert active period (singleton)
 *     tags: [ActivePeriod]
 *     description: Creates the record if missing, otherwise updates it. Only one row is kept in the table.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate]
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: ISO date (e.g. YYYY-MM-DD)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: ISO date (e.g. YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Active period upserted
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const activePeriodController = {
  getActivePeriod: async (_req: Request, res: Response) => {
    try {
      const record = await activePeriodService.getActivePeriod();
      return res.json({
        success: true,
        message: "Active period retrieved successfully",
        data: record,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve active period",
        error: error?.message,
      });
    }
  },

  upsertActivePeriod: async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.body ?? {};

      const start = parseIsoDateRequired(startDate);
      if (!start) {
        return res
          .status(400)
          .json({ success: false, message: "startDate is required and must be a valid ISO date string" });
      }

      const end = parseIsoDateRequired(endDate);
      if (!end) {
        return res
          .status(400)
          .json({ success: false, message: "endDate is required and must be a valid ISO date string" });
      }

      const saved = await activePeriodService.upsertActivePeriod({
        startDate: start,
        endDate: end,
      });

      return res.json({
        success: true,
        message: "Active period saved successfully",
        data: saved,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to save active period";
      const status =
        message.includes("required") || message.includes("must be before") || message.includes("valid")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
