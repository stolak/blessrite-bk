import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { cashierService } from "../services/cashierService";
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

function normalizeOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function httpStatusForCashierError(message: string): number {
  if (
    message === "Cashier not found" ||
    message === "Invalid staffId" ||
    message === "Invalid userId" ||
    message === "Invalid accountChartId"
  ) {
    return 404;
  }
  if (
    message === "name is required" ||
    message === "name cannot be empty" ||
    message.includes("Only one of staffId or userId")
  ) {
    return 400;
  }
  return 500;
}

function assertExclusiveStaffOrUser(body: Record<string, unknown>): string | null {
  const hasStaffKey = Object.prototype.hasOwnProperty.call(body, "staffId");
  const hasUserKey = Object.prototype.hasOwnProperty.call(body, "userId");
  if (hasStaffKey && hasUserKey) {
    return "Only one of staffId or userId may be provided in the request, not both";
  }
  return null;
}

/**
 * @openapi
 * /api/v1/cashiers:
 *   post:
 *     summary: Create a cashier
 *     tags: [Cashiers]
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
 *               staffId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Optional. Link via staff; must not be sent together with userId. The paired userId is resolved from Staff.userId when present.
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Optional. Link via user; must not be sent together with staffId. The paired staffId is resolved from Staff where userId matches, when present.
 *               accountChartId:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional ledger account (AccountChart.id)
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Defaults to Active
 *     responses:
 *       201:
 *         description: Cashier created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invalid staffId, userId, or accountChartId
 *       500:
 *         description: Server error
 *   get:
 *     summary: List cashiers
 *     tags: [Cashiers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by staff id
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user id
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All for every status.
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
 *         description: Cashiers list
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const cashierController = {
  createCashier: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const exclusiveError = assertExclusiveStaffOrUser(body);
      if (exclusiveError) {
        return res.status(400).json({ success: false, message: exclusiveError });
      }

      const { name, staffId, userId, accountChartId, status } = body;

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const normalizedStaffId = normalizeOptionalString(staffId);
      if (staffId !== undefined && normalizedStaffId === undefined) {
        return res.status(400).json({ success: false, message: "staffId must be a string or null" });
      }
      const normalizedUserId = normalizeOptionalString(userId);
      if (userId !== undefined && normalizedUserId === undefined) {
        return res.status(400).json({ success: false, message: "userId must be a string or null" });
      }

      let normalizedAccountChartId: number | null | undefined = undefined;
      if (accountChartId !== undefined) {
        if (accountChartId === null || accountChartId === "") {
          normalizedAccountChartId = null;
        } else {
          const n = typeof accountChartId === "number" ? accountChartId : Number(accountChartId);
          if (!Number.isFinite(n) || n < 1) {
            return res.status(400).json({
              success: false,
              message: "accountChartId must be a positive integer or null",
            });
          }
          normalizedAccountChartId = n;
        }
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await cashierService.createCashier({
        name: name.trim(),
        ...(normalizedStaffId !== undefined ? { staffId: normalizedStaffId } : {}),
        ...(normalizedUserId !== undefined ? { userId: normalizedUserId } : {}),
        ...(normalizedAccountChartId !== undefined ? { accountChartId: normalizedAccountChartId } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Cashier created successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create cashier";
      return res.status(httpStatusForCashierError(message)).json({ success: false, message });
    }
  },

  listCashiers: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = statusRaw === undefined ? undefined : parseStatusQuery(statusRaw);

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await cashierService.listCashiers({
        q,
        ...(staffId !== undefined && staffId.trim() !== "" ? { staffId: staffId.trim() } : {}),
        ...(userId !== undefined && userId.trim() !== "" ? { userId: userId.trim() } : {}),
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Cashiers retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve cashiers",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/cashiers/{id}:
   *   get:
   *     summary: Get a cashier by ID
   *     tags: [Cashiers]
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
   *         description: Cashier details
   *       404:
   *         description: Cashier not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a cashier
   *     tags: [Cashiers]
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
 *               staffId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Must not be sent together with userId. Paired userId is resolved from staff when present.
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Must not be sent together with staffId. Paired staffId is resolved from staff profile when present.
 *               accountChartId:
 *                 type: integer
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       200:
 *         description: Cashier updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Cashier, staff, user, or account not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a cashier
   *     tags: [Cashiers]
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
   *         description: Cashier deleted
   *       404:
   *         description: Cashier not found
   *       500:
   *         description: Server error
   */
  getCashierById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const row = await cashierService.getCashierById(id);
      if (!row) return res.status(404).json({ success: false, message: "Cashier not found" });

      return res.json({ success: true, message: "Cashier retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve cashier",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateCashier: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const exclusiveError = assertExclusiveStaffOrUser(body);
      if (exclusiveError) {
        return res.status(400).json({ success: false, message: exclusiveError });
      }

      const { name, staffId, userId, accountChartId, status } = body;

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({
          success: false,
          message: "name must be a non-empty string when provided",
        });
      }

      const normalizedStaffId = normalizeOptionalString(staffId);
      if (staffId !== undefined && normalizedStaffId === undefined) {
        return res.status(400).json({ success: false, message: "staffId must be a string or null" });
      }
      const normalizedUserId = normalizeOptionalString(userId);
      if (userId !== undefined && normalizedUserId === undefined) {
        return res.status(400).json({ success: false, message: "userId must be a string or null" });
      }

      let normalizedAccountChartId: number | null | undefined = undefined;
      if (accountChartId !== undefined) {
        if (accountChartId === null || accountChartId === "") {
          normalizedAccountChartId = null;
        } else {
          const n = typeof accountChartId === "number" ? accountChartId : Number(accountChartId);
          if (!Number.isFinite(n) || n < 1) {
            return res.status(400).json({
              success: false,
              message: "accountChartId must be a positive integer or null",
            });
          }
          normalizedAccountChartId = n;
        }
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await cashierService.updateCashier(id, {
        ...(name !== undefined ? { name: name as string } : {}),
        ...(normalizedStaffId !== undefined ? { staffId: normalizedStaffId } : {}),
        ...(normalizedUserId !== undefined ? { userId: normalizedUserId } : {}),
        ...(normalizedAccountChartId !== undefined ? { accountChartId: normalizedAccountChartId } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({ success: true, message: "Cashier updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update cashier";
      return res.status(httpStatusForCashierError(message)).json({ success: false, message });
    }
  },

  deleteCashier: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await cashierService.deleteCashier(id);
      return res.json({ success: true, message: "Cashier deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete cashier";
      return res.status(httpStatusForCashierError(message)).json({ success: false, message });
    }
  },
};
