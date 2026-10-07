import { Request, Response } from "express";
import { openBankingScoreService } from "../services/openBankingScoreService";

/**
 * @openapi
 * /api/v1/open-banking-scores/calculate:
 *   post:
 *     summary: Calculate open banking score
 *     description: |
 *       Scores banking/cashflow risk indicators and returns a weighted total score
 *       plus per-component breakdown.
 *     tags: [OpenBankingScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - averageMonthlyIncome
 *               - incomeStabilityVariance
 *               - netCashFlowPercentage
 *               - liquidityMonths
 *               - nsfEvents
 *               - overdraftFrequency
 *               - loanBurdenPercentage
 *             properties:
 *               averageMonthlyIncome:
 *                 type: number
 *                 minimum: 0
 *                 example: 6500
 *               incomeStabilityVariance:
 *                 type: number
 *                 minimum: 0
 *                 example: 12
 *               netCashFlowPercentage:
 *                 type: number
 *                 example: 28
 *               liquidityMonths:
 *                 type: number
 *                 minimum: 0
 *                 example: 3
 *               nsfEvents:
 *                 type: number
 *                 minimum: 0
 *                 example: 0
 *               overdraftFrequency:
 *                 type: number
 *                 minimum: 0
 *                 example: 1
 *               loanBurdenPercentage:
 *                 type: number
 *                 minimum: 0
 *                 example: 15
 *     responses:
 *       200:
 *         description: Open banking score calculated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const openBankingScoreController = {
  calculate: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = openBankingScoreService.calculate(body);

      return res.json({
        success: true,
        message: "Open banking score calculated successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to calculate open banking score";
      const status =
        message.includes("must be") || message.includes("required") ? 400 : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
