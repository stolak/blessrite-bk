import { Request, Response } from "express";
import { privilegeService } from "../services/privilegeService";

/**
 * @openapi
 * /api/v1/privileges:
 *   get:
 *     summary: List all privileges
 *     tags: [Privileges]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches name or description)
 *     responses:
 *       200:
 *         description: Privileges list
 *       500:
 *         description: Server error
 */
export const privilegeController = {
  listPrivileges: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;

      const privileges = await privilegeService.listPrivileges({ q });

      return res.json({
        success: true,
        message: "Privileges retrieved successfully",
        data: { privileges },
      });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve privileges",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },
};
