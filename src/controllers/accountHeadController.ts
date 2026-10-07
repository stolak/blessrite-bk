import { Request, Response } from "express";
import { accountHeadService } from "../services/accountHeadService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/account-heads:
 *   get:
 *     summary: List account heads
 *     description: Returns account heads with parent group, sub-heads, and account charts. Optionally filter by groupId.
 *     tags: [AccountHeads]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: When set, only heads for this account group are returned
 *     responses:
 *       200:
 *         description: Account heads list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountHeads:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           groupId:
 *                             type: integer
 *                           code:
 *                             type: string
 *                           name:
 *                             type: string
 *                           rank:
 *                             type: integer
 *                           group:
 *                             type: object
 *                             properties:
 *                               id: { type: integer }
 *                               name: { type: string }
 *                               rank: { type: integer }
 *                           subHeads:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 groupId: { type: integer }
 *                                 headId: { type: integer }
 *                                 code: { type: string }
 *                                 name: { type: string }
 *                                 status:
 *                                   type: string
 *                                   enum: [Active, Inactive, Archived]
 *                                 rank: { type: integer }
 *                                 afs: { type: string, nullable: true }
 *                                 paymentMethod: { type: string, nullable: true }
 *                           accountCharts:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 groupId: { type: integer }
 *                                 headId: { type: integer }
 *                                 subheadId: { type: integer }
 *                                 accountNo: { type: string }
 *                                 accountRef: { type: string, nullable: true }
 *                                 accountDescription: { type: string }
 *                                 status:
 *                                   type: string
 *                                   enum: [Active, Inactive, Archived]
 *                                 rank: { type: integer }
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
 *                     count:
 *                       type: integer
 *       400:
 *         description: Invalid groupId query
 *       500:
 *         description: Server error
 */
export const accountHeadController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const groupIdRaw =
        typeof req.query.groupId === "string"
          ? req.query.groupId
          : typeof req.query.groupid === "string"
            ? req.query.groupid
            : undefined;
      const groupId = groupIdRaw !== undefined ? parseIntOrUndefined(groupIdRaw) : undefined;

      if (groupIdRaw !== undefined && (groupId === undefined || groupId < 1)) {
        return res.status(400).json({
          success: false,
          message: "groupId must be a positive integer when provided",
        });
      }

      const accountHeads = await accountHeadService.getAll(
        groupId !== undefined ? { groupId } : undefined
      );

      return res.json({
        success: true,
        message: "Account heads retrieved successfully",
        data: {
          accountHeads,
          count: accountHeads.length,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error listing account heads:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account heads",
        error: message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/account-heads/{id}:
   *   get:
   *     summary: Get an account head by numeric ID
   *     description: Returns one account head with parent group, sub-heads, and account charts.
   *     tags: [AccountHeads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Account head primary key
   *     responses:
   *       200:
   *         description: Account head with nested relations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *                     groupId:
   *                       type: integer
   *                     code:
   *                       type: string
   *                     name:
   *                       type: string
   *                     rank:
   *                       type: integer
   *                     group:
   *                       type: object
   *                       properties:
   *                         id: { type: integer }
   *                         name: { type: string }
   *                         rank: { type: integer }
   *                     subHeads:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: integer }
   *                           groupId: { type: integer }
   *                           headId: { type: integer }
   *                           code: { type: string }
   *                           name: { type: string }
   *                           status:
   *                             type: string
   *                             enum: [Active, Inactive, Archived]
   *                           rank: { type: integer }
   *                           afs: { type: string, nullable: true }
   *                           paymentMethod: { type: string, nullable: true }
   *                     accountCharts:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: integer }
   *                           groupId: { type: integer }
   *                           headId: { type: integer }
   *                           subheadId: { type: integer }
   *                           accountNo: { type: string }
   *                           accountRef: { type: string, nullable: true }
   *                           accountDescription: { type: string }
   *                           status:
   *                             type: string
   *                             enum: [Active, Inactive, Archived]
   *                           rank: { type: integer }
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *       400:
   *         description: Invalid ID
   *       404:
   *         description: Account head not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = Number.parseInt(routeParam(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "A positive integer id is required",
        });
      }

      const accountHead = await accountHeadService.getById(id);
      if (!accountHead) {
        return res.status(404).json({
          success: false,
          message: "Account head not found",
        });
      }

      return res.json({
        success: true,
        message: "Account head retrieved successfully",
        data: accountHead,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting account head:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account head",
        error: message,
      });
    }
  },
};
