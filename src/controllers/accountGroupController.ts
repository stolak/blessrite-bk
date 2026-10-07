import { Request, Response } from "express";
import { accountGroupService } from "../services/accountGroupService";
import { routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/account-groups:
 *   get:
 *     summary: List all account groups (chart of accounts)
 *     description: Returns every account group with related heads, sub-heads, and account charts, ordered by rank.
 *     tags: [AccountGroups]
 *     responses:
 *       200:
 *         description: Account groups with nested relations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountGroups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           rank:
 *                             type: integer
 *                           heads:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 groupId: { type: integer }
 *                                 code: { type: string }
 *                                 name: { type: string }
 *                                 rank: { type: integer }
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
 *       500:
 *         description: Server error
 */
export const accountGroupController = {
  getAll: async (_req: Request, res: Response) => {
    try {
      const accountGroups = await accountGroupService.getAll();
      return res.json({
        success: true,
        message: "Account groups retrieved successfully",
        data: {
          accountGroups,
          count: accountGroups.length,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error listing account groups:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account groups",
        error: message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/account-groups/{id}:
   *   get:
   *     summary: Get an account group by numeric ID
   *     description: Returns one account group with related heads, sub-heads, and account charts.
   *     tags: [AccountGroups]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Account group primary key
   *     responses:
   *       200:
   *         description: Account group with nested relations
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
   *                     name:
   *                       type: string
   *                     rank:
   *                       type: integer
   *                     heads:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: integer }
   *                           groupId: { type: integer }
   *                           code: { type: string }
   *                           name: { type: string }
   *                           rank: { type: integer }
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
   *         description: Account group not found
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

      const accountGroup = await accountGroupService.getById(id);
      if (!accountGroup) {
        return res.status(404).json({
          success: false,
          message: "Account group not found",
        });
      }

      return res.json({
        success: true,
        message: "Account group retrieved successfully",
        data: accountGroup,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting account group:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve account group",
        error: message,
      });
    }
  },
};
