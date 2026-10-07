import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { staffBankDetailsService } from "../services/staffBankDetailsService";
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

function parseIsPrimaryQuery(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "invalid";
}

function httpStatusForStaffBankDetailsError(message: string): number {
  if (
    message === "Staff bank details not found" ||
    message === "Invalid staffId" ||
    message === "Invalid bankId"
  ) {
    return 404;
  }
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("Only one bank")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/staff-bank-details:
 *   post:
 *     summary: Create a staff bank account
 *     tags: [StaffBankDetails]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, bankId, accountNumber]
 *             properties:
 *               staffId:
 *                 type: string
 *                 format: uuid
 *               bankId:
 *                 type: string
 *                 format: uuid
 *               accountNumber:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *                 description: When true, clears isPrimary on other bank rows for this staff
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Staff bank details created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Staff or bank not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: List staff bank details
 *     tags: [StaffBankDetails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: bankId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: isPrimary
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list
 *       400:
 *         description: Invalid query
 *       500:
 *         description: Server error
 */
export const staffBankDetailsController = {
  create: async (req: Request, res: Response) => {
    try {
      const { staffId, bankId, accountNumber, isPrimary, status } = req.body ?? {};

      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!bankId || typeof bankId !== "string" || !bankId.trim()) {
        return res.status(400).json({ success: false, message: "bankId is required" });
      }
      if (!accountNumber || typeof accountNumber !== "string" || !accountNumber.trim()) {
        return res.status(400).json({ success: false, message: "accountNumber is required" });
      }
      if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
        return res.status(400).json({ success: false, message: "isPrimary must be a boolean" });
      }
      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await staffBankDetailsService.create({
        staffId: staffId.trim(),
        bankId: bankId.trim(),
        accountNumber: accountNumber.trim(),
        ...(typeof isPrimary === "boolean" ? { isPrimary } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Staff bank details created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create staff bank details";
      return res.status(httpStatusForStaffBankDetailsError(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-bank-details/bulk:
   *   post:
   *     summary: Create multiple bank accounts for one staff member
   *     tags: [StaffBankDetails]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Creates multiple StaffBankDetails rows for the same staffId in one transaction.
   *       At most one entry in `banks` may have `isPrimary` true; when set, other primary rows for that staff are cleared first.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [staffId, banks]
   *             properties:
   *               staffId:
   *                 type: string
   *                 format: uuid
   *               banks:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [bankId, accountNumber]
   *                   properties:
   *                     bankId:
   *                       type: string
   *                       format: uuid
   *                     accountNumber:
   *                       type: string
   *                     isPrimary:
   *                       type: boolean
   *                     status:
   *                       type: string
   *                       enum: [Active, Inactive, Archived]
   *     responses:
   *       201:
   *         description: Staff bank details created
   *       400:
   *         description: Validation error
   *       404:
   *         description: Staff or bank not found
   *       500:
   *         description: Server error
   */
  createBulk: async (req: Request, res: Response) => {
    try {
      const { staffId, banks } = req.body ?? {};

      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!Array.isArray(banks) || banks.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "banks is required and must be a non-empty array" });
      }

      const normalizedBanks: Array<{
        bankId: string;
        accountNumber: string;
        isPrimary?: boolean;
        status?: Status;
      }> = [];

      for (const [idx, row] of banks.entries()) {
        if (!row || typeof row !== "object") {
          return res
            .status(400)
            .json({ success: false, message: `banks[${idx}] must be an object` });
        }
        const { bankId, accountNumber, isPrimary, status } = row as Record<string, unknown>;
        if (!bankId || typeof bankId !== "string" || !bankId.trim()) {
          return res
            .status(400)
            .json({ success: false, message: `banks[${idx}].bankId is required` });
        }
        if (!accountNumber || typeof accountNumber !== "string" || !accountNumber.trim()) {
          return res.status(400).json({
            success: false,
            message: `banks[${idx}].accountNumber is required`,
          });
        }
        if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `banks[${idx}].isPrimary must be a boolean`,
          });
        }
        const parsedStatus = parseBodyStatus(status);
        if (status !== undefined && parsedStatus === undefined) {
          return res.status(400).json({
            success: false,
            message: `banks[${idx}].status must be Active, Inactive, or Archived`,
          });
        }
        normalizedBanks.push({
          bankId: bankId.trim(),
          accountNumber: accountNumber.trim(),
          ...(typeof isPrimary === "boolean" ? { isPrimary } : {}),
          ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        });
      }

      const created = await staffBankDetailsService.createBulk({
        staffId: staffId.trim(),
        banks: normalizedBanks,
      });

      return res.status(201).json({
        success: true,
        message: "Staff bank details created successfully",
        data: { staffBankDetails: created, count: created.length },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create staff bank details in bulk";
      return res.status(httpStatusForStaffBankDetailsError(message)).json({ success: false, message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId.trim() : undefined;
      const bankId = typeof req.query.bankId === "string" ? req.query.bankId.trim() : undefined;

      const isPrimaryParsed = parseIsPrimaryQuery(
        typeof req.query.isPrimary === "string" ? req.query.isPrimary : undefined
      );
      if (isPrimaryParsed === "invalid") {
        return res.status(400).json({ success: false, message: "isPrimary must be true or false" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await staffBankDetailsService.list({
        ...(staffId ? { staffId } : {}),
        ...(bankId ? { bankId } : {}),
        ...(isPrimaryParsed !== undefined ? { isPrimary: isPrimaryParsed } : {}),
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Staff bank details retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff bank details",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/staff-bank-details/{id}:
   *   get:
   *     summary: Get staff bank details by ID
   *     tags: [StaffBankDetails]
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
   *         description: Staff bank details found
   *       404:
   *         description: Not found
   *   put:
   *     summary: Update staff bank details
   *     tags: [StaffBankDetails]
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
   *               bankId:
   *                 type: string
   *                 format: uuid
   *               accountNumber:
   *                 type: string
   *               isPrimary:
   *                 type: boolean
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *   delete:
   *     summary: Delete staff bank details
   *     tags: [StaffBankDetails]
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
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await staffBankDetailsService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Staff bank details not found" });
      }

      return res.json({
        success: true,
        message: "Staff bank details retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff bank details",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { bankId, accountNumber, isPrimary, status } = req.body ?? {};
      const hasAny =
        bankId !== undefined ||
        accountNumber !== undefined ||
        isPrimary !== undefined ||
        status !== undefined;

      if (!hasAny) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided to update",
        });
      }

      if (bankId !== undefined && (typeof bankId !== "string" || !bankId.trim())) {
        return res.status(400).json({ success: false, message: "bankId must be a non-empty string" });
      }
      if (
        accountNumber !== undefined &&
        (typeof accountNumber !== "string" || !accountNumber.trim())
      ) {
        return res
          .status(400)
          .json({ success: false, message: "accountNumber must be a non-empty string" });
      }
      if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
        return res.status(400).json({ success: false, message: "isPrimary must be a boolean" });
      }
      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await staffBankDetailsService.update(id, {
        ...(bankId !== undefined ? { bankId: bankId.trim() } : {}),
        ...(accountNumber !== undefined ? { accountNumber: accountNumber.trim() } : {}),
        ...(typeof isPrimary === "boolean" ? { isPrimary } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Staff bank details updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update staff bank details";
      return res.status(httpStatusForStaffBankDetailsError(message)).json({ success: false, message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id).trim();
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await staffBankDetailsService.delete(id);
      return res.json({
        success: true,
        message: "Staff bank details deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete staff bank details";
      return res.status(httpStatusForStaffBankDetailsError(message)).json({ success: false, message });
    }
  },
};
