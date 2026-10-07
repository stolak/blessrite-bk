import { Request, Response } from "express";
import { defaultBillingPeriodService } from "../services/defaultBillingPeriodService";

function parseIsoDateRequired(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @openapi
 * /api/v1/default-billing-period:
 *   get:
 *     summary: Get default billing period (singleton)
 *     tags: [DefaultBillingPeriod]
 *     responses:
 *       200:
 *         description: Default billing period record (or null if not set)
 *       500:
 *         description: Server error
 *   put:
 *     summary: Upsert default billing period (singleton)
 *     tags: [DefaultBillingPeriod]
 *     description: Creates the record if missing, otherwise updates it. Only one row is kept in the table.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate, sessionId, termId]
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: ISO date (e.g. YYYY-MM-DD)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: ISO date (e.g. YYYY-MM-DD)
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Default billing period upserted
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invalid sessionId/termId
 *       500:
 *         description: Server error
 */
export const defaultBillingPeriodController = {
  getDefaultBillingPeriod: async (_req: Request, res: Response) => {
    try {
      const record = await defaultBillingPeriodService.getDefaultBillingPeriod();
      return res.json({
        success: true,
        message: "Default billing period retrieved successfully",
        data: record,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve default billing period",
        error: error?.message,
      });
    }
  },

  upsertDefaultBillingPeriod: async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, sessionId, termId } = req.body ?? {};

      const start = parseIsoDateRequired(startDate);
      if (!start) {
        return res.status(400).json({
          success: false,
          message: "startDate is required and must be a valid ISO date string",
        });
      }

      const end = parseIsoDateRequired(endDate);
      if (!end) {
        return res.status(400).json({
          success: false,
          message: "endDate is required and must be a valid ISO date string",
        });
      }

      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }

      const saved = await defaultBillingPeriodService.upsertDefaultBillingPeriod({
        startDate: start,
        endDate: end,
        sessionId: sessionId.trim(),
        termId: termId.trim(),
      });

      return res.json({
        success: true,
        message: "Default billing period saved successfully",
        data: saved,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to save default billing period";
      const status =
        message === "Invalid sessionId" || message === "Invalid termId"
          ? 404
          : message.includes("required") || message.includes("must be before") || message.includes("valid")
            ? 400
            : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
