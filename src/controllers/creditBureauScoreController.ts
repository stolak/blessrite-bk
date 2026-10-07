import { Request, Response } from "express";
import { creditBureauScoreService } from "../services/creditBureauScoreService";

/**
 * @openapi
 * /api/v1/credit-bureau-scores/calculate:
 *   post:
 *     summary: Calculate credit bureau score
 *     description: |
 *       Scores credit-bureau risk indicators and returns a weighted score
 *       (0–10 raw, 0–100 scaled) plus per-component breakdown.
 *     tags: [CreditBureauScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - creditScore
 *               - utilizationPercentage
 *               - delinquencies24Months
 *               - collections
 *               - hardInquiries12Months
 *               - bankruptcy
 *             properties:
 *               creditScore:
 *                 type: number
 *                 minimum: 0
 *                 example: 720
 *               utilizationPercentage:
 *                 type: number
 *                 minimum: 0
 *                 example: 35
 *               delinquencies24Months:
 *                 type: integer
 *                 minimum: 0
 *                 example: 1
 *               collections:
 *                 type: string
 *                 enum: [NONE, PAID, ACTIVE]
 *                 example: NONE
 *               hardInquiries12Months:
 *                 type: integer
 *                 minimum: 0
 *                 example: 2
 *               bankruptcy:
 *                 type: string
 *                 enum: [NONE, DISCHARGED_OVER_5_YEARS, ACTIVE_OR_RECENT]
 *                 example: NONE
 *     responses:
 *       200:
 *         description: Credit bureau score calculated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const creditBureauScoreController = {
  calculate: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = creditBureauScoreService.calculate(body);

      return res.json({
        success: true,
        message: "Credit bureau score calculated successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to calculate credit bureau score";
      const status =
        message.includes("must be") || message.includes("required") ? 400 : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
