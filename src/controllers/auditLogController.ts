import { Request, Response } from "express";
import { auditService } from "../services/auditService";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { parseIntOrUndefined } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

function parseListFilters(req: Request) {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const performedById =
    typeof req.query.performedById === "string" ? req.query.performedById : undefined;

  const fromRaw = parseQueryDateStart(req.query.createdAtFrom);
  const toRaw = parseQueryDateEndInclusive(req.query.createdAtTo);
  if (fromRaw === "invalid") {
    return { error: "createdAtFrom is invalid" as const };
  }
  if (toRaw === "invalid") {
    return { error: "createdAtTo is invalid" as const };
  }

  const createdAtFrom = fromRaw === "missing" ? undefined : fromRaw;
  const createdAtTo = toRaw === "missing" ? undefined : toRaw;
  const page = parseIntOrUndefined(req.query.page);
  const limit = parseIntOrUndefined(req.query.limit);

  return {
    action: action?.trim() || undefined,
    entityType: entityType?.trim() || undefined,
    status: status?.trim() || undefined,
    performedById: performedById?.trim() || undefined,
    createdAtFrom,
    createdAtTo,
    page,
    limit,
  };
}

/**
 * @openapi
 * /api/v1/audit-logs/me:
 *   get:
 *     summary: List audit logs for the authenticated user
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Returns audit log entries where performedById matches the authenticated user's id (from JWT).
 *       Supports the same optional filters as the global list endpoint except performedById.
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action (e.g. CREATE, UPDATE, DELETE, LOGIN)
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g. User, Invoice, Product)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (defaults to SUCCESS on create; stored value is matched exactly)
 *       - in: query
 *         name: createdAtFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive start of createdAt range (YYYY-MM-DD or ISO date-time)
 *       - in: query
 *         name: createdAtTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive end of createdAt range (YYYY-MM-DD or ISO date-time)
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
 *         description: Paginated audit logs for the current user
 *       400:
 *         description: Invalid date filter
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const auditLogController = {
  listMyAuditLogs: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const parsed = parseListFilters(req);
      if ("error" in parsed) {
        return res.status(400).json({ success: false, message: parsed.error });
      }

      const result = await auditService.listAuditLogs({
        performedById: userId,
        action: parsed.action,
        entityType: parsed.entityType,
        status: parsed.status,
        createdAtFrom: parsed.createdAtFrom,
        createdAtTo: parsed.createdAtTo,
        page: parsed.page,
        limit: parsed.limit,
      });

      return res.json({
        success: true,
        message: "Audit logs retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve audit logs",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/audit-logs:
   *   get:
   *     summary: List all audit logs
   *     tags: [AuditLogs]
   *     security:
   *       - bearerAuth: []
   *     description: Returns paginated audit logs with optional filters.
   *     parameters:
   *       - in: query
   *         name: performedById
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Filter by user who performed the action
   *       - in: query
   *         name: action
   *         schema:
   *           type: string
   *         description: Filter by action (e.g. CREATE, UPDATE, DELETE, LOGIN)
   *       - in: query
   *         name: entityType
   *         schema:
   *           type: string
   *         description: Filter by entity type (e.g. User, Invoice, Product)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *         description: Filter by status
   *       - in: query
   *         name: createdAtFrom
   *         schema:
   *           type: string
   *           format: date
   *         description: Inclusive start of createdAt range (YYYY-MM-DD or ISO date-time)
   *       - in: query
   *         name: createdAtTo
   *         schema:
   *           type: string
   *           format: date
   *         description: Inclusive end of createdAt range (YYYY-MM-DD or ISO date-time)
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
   *         description: Paginated audit log list
   *       400:
   *         description: Invalid date filter
   *       500:
   *         description: Server error
   */
  listAuditLogs: async (req: Request, res: Response) => {
    try {
      const parsed = parseListFilters(req);
      if ("error" in parsed) {
        return res.status(400).json({ success: false, message: parsed.error });
      }

      const result = await auditService.listAuditLogs({
        performedById: parsed.performedById,
        action: parsed.action,
        entityType: parsed.entityType,
        status: parsed.status,
        createdAtFrom: parsed.createdAtFrom,
        createdAtTo: parsed.createdAtTo,
        page: parsed.page,
        limit: parsed.limit,
      });

      return res.json({
        success: true,
        message: "Audit logs retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve audit logs",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },
};
