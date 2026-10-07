import { Request, Response } from "express";
import { behaviouralAssessmentComponentService } from "../services/behaviouralAssessmentComponentService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal, parseBodyInt, parseBodyStatus, parseStatusQuery } from "../utils/assessmentHttp";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/behavioural-assessment-components:
 *   post:
 *     summary: Create a behavioural assessment component
 *     tags: [BehaviouralAssessmentComponents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [behaviourTemplateId, name, orderNo]
 *             properties:
 *               behaviourTemplateId:
 *                 type: string
 *               name:
 *                 type: string
 *               maxScore:
 *                 type: number
 *               orderNo:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Behavioural assessment component created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List behavioural assessment components
 *     tags: [BehaviouralAssessmentComponents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *       - in: query
 *         name: behaviourTemplateId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Behavioural assessment components list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const behaviouralAssessmentComponentController = {
  create: async (req: Request, res: Response) => {
    try {
      const { behaviourTemplateId, name, maxScore, orderNo, status } = req.body ?? {};

      if (!behaviourTemplateId || typeof behaviourTemplateId !== "string" || !behaviourTemplateId.trim()) {
        return res.status(400).json({ success: false, message: "behaviourTemplateId is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const parsedOrderNo = parseBodyInt(orderNo);
      if (parsedOrderNo === "missing") {
        return res.status(400).json({ success: false, message: "orderNo is required" });
      }
      if (parsedOrderNo === "invalid") {
        return res.status(400).json({ success: false, message: "orderNo must be an integer" });
      }

      const parsedMaxScore = parseBodyDecimal(maxScore, "maxScore");
      if (maxScore !== undefined && parsedMaxScore === "invalid") {
        return res.status(400).json({ success: false, message: "maxScore must be a number" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const created = await behaviouralAssessmentComponentService.create({
        behaviourTemplateId: behaviourTemplateId.trim(),
        name: name.trim(),
        orderNo: parsedOrderNo,
        ...(parsedMaxScore !== "missing" && parsedMaxScore !== "invalid" ? { maxScore: parsedMaxScore } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Behavioural assessment component created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create behavioural assessment component");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const statusRaw = queryString(req.query, "status");
      const statusParsed = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && statusParsed === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, Archived, or All" });
      }

      const result = await behaviouralAssessmentComponentService.list({
        q: queryString(req.query, "q"),
        behaviourTemplateId: queryString(req.query, "behaviourTemplateId"),
        ...(statusParsed !== undefined ? { status: statusParsed } : {}),
      });

      return res.json({
        success: true,
        message: "Behavioural assessment components retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural assessment components");
    }
  },

  /**
   * @openapi
   * /api/v1/behavioural-assessment-components/{id}:
   *   get:
   *     summary: Get a behavioural assessment component by ID
   *     tags: [BehaviouralAssessmentComponents]
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
   *         description: Behavioural assessment component details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a behavioural assessment component
   *     tags: [BehaviouralAssessmentComponents]
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
   *               behaviourTemplateId:
   *                 type: string
   *               name:
   *                 type: string
   *               maxScore:
   *                 type: number
   *               orderNo:
   *                 type: integer
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Behavioural assessment component updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a behavioural assessment component
   *     tags: [BehaviouralAssessmentComponents]
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
   *         description: Behavioural assessment component deleted
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await behaviouralAssessmentComponentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Behavioural assessment component not found" });
      }

      return res.json({
        success: true,
        message: "Behavioural assessment component retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural assessment component");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { behaviourTemplateId, name, maxScore, orderNo, status } = req.body ?? {};
      if (
        behaviourTemplateId === undefined &&
        name === undefined &&
        maxScore === undefined &&
        orderNo === undefined &&
        status === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (behaviourTemplateId !== undefined && (typeof behaviourTemplateId !== "string" || !behaviourTemplateId.trim())) {
        return res.status(400).json({ success: false, message: "behaviourTemplateId must be a non-empty string" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      const parsedOrderNo = parseBodyInt(orderNo);
      if (orderNo !== undefined && parsedOrderNo === "invalid") {
        return res.status(400).json({ success: false, message: "orderNo must be an integer" });
      }

      const parsedMaxScore = parseBodyDecimal(maxScore, "maxScore");
      if (maxScore !== undefined && parsedMaxScore === "invalid") {
        return res.status(400).json({ success: false, message: "maxScore must be a number" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const updated = await behaviouralAssessmentComponentService.update(id, {
        ...(behaviourTemplateId !== undefined ? { behaviourTemplateId: behaviourTemplateId.trim() } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(parsedMaxScore !== "missing" && parsedMaxScore !== "invalid" ? { maxScore: parsedMaxScore } : {}),
        ...(parsedOrderNo !== "missing" && parsedOrderNo !== "invalid" ? { orderNo: parsedOrderNo } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Behavioural assessment component updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update behavioural assessment component");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await behaviouralAssessmentComponentService.delete(id);

      return res.json({
        success: true,
        message: "Behavioural assessment component deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete behavioural assessment component");
    }
  },
};
