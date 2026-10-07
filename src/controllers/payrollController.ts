import { Request, Response } from "express";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { payrollService } from "../services/payrollService";
import { routeParam } from "../utils/request";

function parseYearMonthQuery(
  yearRaw: unknown,
  monthRaw: unknown
): { year: number; month: number } | null {
  const year =
    typeof yearRaw === "string"
      ? Number.parseInt(yearRaw, 10)
      : typeof yearRaw === "number"
        ? yearRaw
        : NaN;
  const month =
    typeof monthRaw === "string"
      ? Number.parseInt(monthRaw, 10)
      : typeof monthRaw === "number"
        ? monthRaw
        : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function httpStatusForPayrollReportError(message: string): number {
  if (message === "Invalid staffId") return 404;
  if (message.includes("must be")) return 400;
  return 500;
}

function httpStatusForPayrollActionError(message: string): number {
  if (
    message.includes("must be") ||
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("cannot") ||
    message.includes("Only approved") ||
    message.includes("valid account number")
  ) {
    return 400;
  }
  return 500;
}

function parseYearMonthBody(body: Record<string, unknown>): { year: number; month: number } | null {
  const year =
    typeof body.year === "number"
      ? body.year
      : typeof body.year === "string"
        ? Number.parseInt(body.year, 10)
        : NaN;
  const month =
    typeof body.month === "number"
      ? body.month
      : typeof body.month === "string"
        ? Number.parseInt(body.month, 10)
        : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function parseOptionalIds(body: Record<string, unknown>): unknown {
  return body.ids === undefined ? undefined : body.ids;
}

/**
 * @openapi
 * /api/v1/payroll/compute:
 *   post:
 *     summary: Run payroll computation
 *     description: Computes payroll for the current period. Placeholder implementation — no processing yet.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Computation completed successfully
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/payroll/report:
 *   get:
 *     summary: Payroll report for a period
 *     description: >
 *       Returns periodComponent (unique salary components used in the period, earnings first then deductions by rank)
 *       and staffPayroll (payroll processes for the period with nested payroll components).
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2100
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional filter for staffPayroll only
 *     responses:
 *       200:
 *         description: Payroll report
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invalid staffId
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/payroll/approval:
 *   patch:
 *     summary: Approve or unapprove payroll for a period
 *     description: >
 *       Sets approval for all payroll processes in the given year/month, or only those listed in ids.
 *       Posted records cannot be unapproved.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, month, approved]
 *             properties:
 *               year: { type: integer, minimum: 1900, maximum: 2100 }
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               approved: { type: boolean }
 *               ids:
 *                 type: array
 *                 description: Optional payroll process UUIDs; omit to affect all records in the period
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
/**
 * @openapi
 * /api/v1/payroll/post:
 *   patch:
 *     summary: Post approved payroll for a period
 *     description: >
 *       Posts all approved, unposted payroll processes for the given year/month, or only those in ids.
 *       Posting is irreversible. Only approved records can be posted.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, month]
 *             properties:
 *               year: { type: integer, minimum: 1900, maximum: 2100 }
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               ids:
 *                 type: array
 *                 description: Optional payroll process UUIDs; omit to post all eligible records in the period
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200: { description: Posted }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
export const payrollController = {
  report: async (req: Request, res: Response) => {
    try {
      const parsed = parseYearMonthQuery(req.query.year, req.query.month);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "year and month are required and must be integers",
        });
      }

      const staffIdRaw =
        typeof req.query.staffId === "string" ? routeParam(req.query.staffId).trim() : undefined;
      const staffId = staffIdRaw || undefined;

      const data = await payrollService.getPayrollReport({
        year: parsed.year,
        month: parsed.month,
        ...(staffId ? { staffId } : {}),
      });

      return res.json({
        success: true,
        message: "Payroll report retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve payroll report";
      return res.status(httpStatusForPayrollReportError(message)).json({ success: false, message });
    }
  },

  compute: async (_req: Request, res: Response) => {
    try {
      const result = await payrollService.compute();

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.message });
      }

      return res.json({
        success: true,
        message: result.message,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to run payroll computation",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  setApproval: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const parsed = parseYearMonthBody(body);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "year and month are required and must be integers",
        });
      }
      if (typeof body.approved !== "boolean") {
        return res.status(400).json({ success: false, message: "approved must be a boolean" });
      }

      const result = await payrollService.setApproval({
        year: parsed.year,
        month: parsed.month,
        approved: body.approved,
        actedBy,
        ids: parseOptionalIds(body) as string[] | undefined,
      });

      return res.json({
        success: true,
        message: body.approved
          ? "Payroll approved successfully"
          : "Payroll unapproved successfully",
        data: {
          updatedCount: result.count,
          approved: result.approved,
          year: parsed.year,
          month: parsed.month,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update payroll approval";
      return res.status(httpStatusForPayrollActionError(message)).json({ success: false, message });
    }
  },

  post: async (req: Request, res: Response) => {
    try {
      const actedBy = getAuthenticatedUserId(req);
      if (!actedBy) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const parsed = parseYearMonthBody(body);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "year and month are required and must be integers",
        });
      }

      const result = await payrollService.postPayroll({
        year: parsed.year,
        month: parsed.month,
        actedBy,
        ids: parseOptionalIds(body) as string[] | undefined,
      });

      return res.json({
        success: true,
        message: "Payroll posted successfully",
        data: {
          postedCount: result.count,
          year: parsed.year,
          month: parsed.month,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to post payroll";
      return res.status(httpStatusForPayrollActionError(message)).json({ success: false, message });
    }
  },
};
