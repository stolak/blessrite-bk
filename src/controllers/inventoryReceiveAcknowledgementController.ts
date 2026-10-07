import { Request, Response } from "express";
import { inventoryReceiveAcknowledgementService } from "../services/inventoryReceiveAcknowledgementService";

function httpStatusForAcknowledgement(message: string): number {
  if (
    message === "No inventory transactions found for this referenceNo" ||
    message === "Store not found"
  ) {
    return 404;
  }
  if (message === "You do not have access to acknowledge receipts for this store") {
    return 403;
  }
  if (
    message === "referenceNo is required" ||
    message.includes("storeId") ||
    message.includes("already acknowledged")
  ) {
    return 400;
  }
  return 500;
}

/**
 * @openapi
 * /api/v1/inventory-receive-acknowledgements:
 *   post:
 *     summary: Acknowledge inventory receipt by reference number
 *     tags: [InventoryReceiveAcknowledgements]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Finds all inventory transactions with the given `referenceNo`, verifies they share one
 *       non-null `storeId`, confirms the authenticated user may access that store (manager or
 *       `user_stores` grant), then sets `isAcknowledged`, `acknowledgedAt`, and `acknowledgedBy`
 *       on every matching row. Fails if any row is already acknowledged.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [referenceNo]
 *             properties:
 *               referenceNo:
 *                 type: string
 *                 description: Batch reference shared by receive transactions (e.g. purchase reference)
 *     responses:
 *       200:
 *         description: Receipt acknowledged
 *       400:
 *         description: Validation error or partial prior acknowledgement
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User lacks store access
 *       404:
 *         description: referenceNo or store not found
 *       500:
 *         description: Server error
 */
export const inventoryReceiveAcknowledgementController = {
  acknowledge: async (req: Request, res: Response) => {
    try {
      const userId = (req as { user?: { id: string } }).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { referenceNo } = req.body ?? {};
      if (!referenceNo || typeof referenceNo !== "string" || !referenceNo.trim()) {
        return res.status(400).json({ success: false, message: "referenceNo is required" });
      }

      const data = await inventoryReceiveAcknowledgementService.acknowledgeByReferenceNo({
        referenceNo: referenceNo.trim(),
        userId,
      });

      return res.json({
        success: true,
        message: "Inventory receipt acknowledged successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to acknowledge inventory receipt";
      return res.status(httpStatusForAcknowledgement(message)).json({ success: false, message });
    }
  },
};
