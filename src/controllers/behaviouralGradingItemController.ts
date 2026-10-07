import { Request, Response } from "express";
import { behaviouralGradingItemService } from "../services/behaviouralGradingItemService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/behavioural-grading-items:
 *   post:
 *     summary: Create a behavioural grading item
 *     tags: [BehaviouralGradingItems]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [behaviouralGradingTemplateId, grade, lowBoundary, highBoundary, gradePoint]
 *             properties:
 *               behaviouralGradingTemplateId:
 *                 type: string
 *               grade:
 *                 type: string
 *               lowBoundary:
 *                 type: number
 *               highBoundary:
 *                 type: number
 *               gradePoint:
 *                 type: number
 *               remark:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Behavioural grading item created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List behavioural grading items
 *     tags: [BehaviouralGradingItems]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: behaviouralGradingTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: grade
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Behavioural grading items list
 *       500:
 *         description: Server error
 */
export const behaviouralGradingItemController = {
  create: async (req: Request, res: Response) => {
    try {
      const { behaviouralGradingTemplateId, grade, lowBoundary, highBoundary, gradePoint, remark } = req.body ?? {};

      if (
        !behaviouralGradingTemplateId ||
        typeof behaviouralGradingTemplateId !== "string" ||
        !behaviouralGradingTemplateId.trim()
      ) {
        return res.status(400).json({ success: false, message: "behaviouralGradingTemplateId is required" });
      }
      if (!grade || typeof grade !== "string" || !grade.trim()) {
        return res.status(400).json({ success: false, message: "grade is required" });
      }

      const parsedLowBoundary = parseBodyDecimal(lowBoundary, "lowBoundary");
      if (parsedLowBoundary === "missing") {
        return res.status(400).json({ success: false, message: "lowBoundary is required" });
      }
      if (parsedLowBoundary === "invalid") {
        return res.status(400).json({ success: false, message: "lowBoundary must be a number" });
      }

      const parsedHighBoundary = parseBodyDecimal(highBoundary, "highBoundary");
      if (parsedHighBoundary === "missing") {
        return res.status(400).json({ success: false, message: "highBoundary is required" });
      }
      if (parsedHighBoundary === "invalid") {
        return res.status(400).json({ success: false, message: "highBoundary must be a number" });
      }

      const parsedGradePoint = parseBodyDecimal(gradePoint, "gradePoint");
      if (parsedGradePoint === "missing") {
        return res.status(400).json({ success: false, message: "gradePoint is required" });
      }
      if (parsedGradePoint === "invalid") {
        return res.status(400).json({ success: false, message: "gradePoint must be a number" });
      }

      if (!isStringOrNullOrUndefined(remark)) {
        return res.status(400).json({ success: false, message: "remark must be a string or null" });
      }

      const created = await behaviouralGradingItemService.create({
        behaviouralGradingTemplateId: behaviouralGradingTemplateId.trim(),
        grade: grade.trim(),
        lowBoundary: parsedLowBoundary,
        highBoundary: parsedHighBoundary,
        gradePoint: parsedGradePoint,
        ...(remark !== undefined ? { remark } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Behavioural grading item created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create behavioural grading item");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await behaviouralGradingItemService.list({
        behaviouralGradingTemplateId: queryString(req.query, "behaviouralGradingTemplateId"),
        grade: queryString(req.query, "grade"),
      });

      return res.json({
        success: true,
        message: "Behavioural grading items retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural grading items");
    }
  },

  /**
   * @openapi
   * /api/v1/behavioural-grading-items/{id}:
   *   get:
   *     summary: Get a behavioural grading item by ID
   *     tags: [BehaviouralGradingItems]
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
   *         description: Behavioural grading item details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a behavioural grading item
   *     tags: [BehaviouralGradingItems]
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
   *               grade:
   *                 type: string
   *               lowBoundary:
   *                 type: number
   *               highBoundary:
   *                 type: number
   *               gradePoint:
   *                 type: number
   *               remark:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Behavioural grading item updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a behavioural grading item
   *     tags: [BehaviouralGradingItems]
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
   *         description: Behavioural grading item deleted
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

      const row = await behaviouralGradingItemService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Behavioural grading item not found" });
      }

      return res.json({
        success: true,
        message: "Behavioural grading item retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural grading item");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { grade, lowBoundary, highBoundary, gradePoint, remark } = req.body ?? {};
      if (
        grade === undefined &&
        lowBoundary === undefined &&
        highBoundary === undefined &&
        gradePoint === undefined &&
        remark === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (grade !== undefined && (typeof grade !== "string" || !grade.trim())) {
        return res.status(400).json({ success: false, message: "grade must be a non-empty string" });
      }
      if (remark !== undefined && !isStringOrNullOrUndefined(remark)) {
        return res.status(400).json({ success: false, message: "remark must be a string or null" });
      }

      const parsedLowBoundary = parseBodyDecimal(lowBoundary, "lowBoundary");
      if (lowBoundary !== undefined && parsedLowBoundary === "invalid") {
        return res.status(400).json({ success: false, message: "lowBoundary must be a number" });
      }
      const parsedHighBoundary = parseBodyDecimal(highBoundary, "highBoundary");
      if (highBoundary !== undefined && parsedHighBoundary === "invalid") {
        return res.status(400).json({ success: false, message: "highBoundary must be a number" });
      }
      const parsedGradePoint = parseBodyDecimal(gradePoint, "gradePoint");
      if (gradePoint !== undefined && parsedGradePoint === "invalid") {
        return res.status(400).json({ success: false, message: "gradePoint must be a number" });
      }

      const updated = await behaviouralGradingItemService.update(id, {
        ...(grade !== undefined ? { grade: grade.trim() } : {}),
        ...(parsedLowBoundary !== "missing" && parsedLowBoundary !== "invalid"
          ? { lowBoundary: parsedLowBoundary }
          : {}),
        ...(parsedHighBoundary !== "missing" && parsedHighBoundary !== "invalid"
          ? { highBoundary: parsedHighBoundary }
          : {}),
        ...(parsedGradePoint !== "missing" && parsedGradePoint !== "invalid"
          ? { gradePoint: parsedGradePoint }
          : {}),
        ...(remark !== undefined ? { remark } : {}),
      });

      return res.json({
        success: true,
        message: "Behavioural grading item updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update behavioural grading item");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await behaviouralGradingItemService.delete(id);

      return res.json({
        success: true,
        message: "Behavioural grading item deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete behavioural grading item");
    }
  },
};
