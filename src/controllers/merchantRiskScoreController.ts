import { Request, Response } from "express";
import { merchantRiskScoreService } from "../services/merchantRiskScoreService";

/**
 * @openapi
 * /api/v1/merchant-risk-scores/calculate:
 *   post:
 *     summary: Calculate merchant risk score
 *     description: |
 *       Scores merchant category risk (0–10, supplied) and purchase utilization,
 *       then returns a weighted score with component breakdown.
 *       Formula: Merchant Category × 60% + Purchase Utilization × 40%.
 *     tags: [MerchantRiskScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchantCategory
 *               - merchantCategoryScore
 *               - purchaseUtilizationPercentage
 *             properties:
 *               merchantCategory:
 *                 type: string
 *                 example: Electronics
 *               merchantCategoryScore:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 10
 *                 example: 7
 *               purchaseUtilizationPercentage:
 *                 type: number
 *                 minimum: 0
 *                 example: 35
 *     responses:
 *       200:
 *         description: Merchant risk score calculated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const merchantRiskScoreController = {
  calculate: async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = merchantRiskScoreService.calculate(body);

      return res.json({
        success: true,
        message: "Merchant risk score calculated successfully",
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to calculate merchant risk score";
      const status =
        message.includes("must be") ||
        message.includes("required") ||
        message.includes("cannot be")
          ? 400
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
