import { Request, Response } from "express";
import { gradingTemplateItemService } from "../services/gradingTemplateItemService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/grading-template-items:
 *   post:
 *     summary: Create a grading template item
 *     tags: [GradingTemplateItems]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gradingTemplateId, grade, minScore, maxScore, gradePoint]
 *             properties:
 *               gradingTemplateId:
 *                 type: string
 *               grade:
 *                 type: string
 *               minScore:
 *                 type: number
 *               maxScore:
 *                 type: number
 *               gradePoint:
 *                 type: number
 *               remark:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Grading template item created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List grading template items
 *     tags: [GradingTemplateItems]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gradingTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: grade
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Grading template items list
 *       500:
 *         description: Server error
 */
export const gradingTemplateItemController = {
  create: async (req: Request, res: Response) => {
    try {
      const { gradingTemplateId, grade, minScore, maxScore, gradePoint, remark } = req.body ?? {};

      if (!gradingTemplateId || typeof gradingTemplateId !== "string" || !gradingTemplateId.trim()) {
        return res.status(400).json({ success: false, message: "gradingTemplateId is required" });
      }
      if (!grade || typeof grade !== "string" || !grade.trim()) {
        return res.status(400).json({ success: false, message: "grade is required" });
      }

      const parsedMinScore = parseBodyDecimal(minScore, "minScore");
      if (parsedMinScore === "missing") {
        return res.status(400).json({ success: false, message: "minScore is required" });
      }
      if (parsedMinScore === "invalid") {
        return res.status(400).json({ success: false, message: "minScore must be a number" });
      }

      const parsedMaxScore = parseBodyDecimal(maxScore, "maxScore");
      if (parsedMaxScore === "missing") {
        return res.status(400).json({ success: false, message: "maxScore is required" });
      }
      if (parsedMaxScore === "invalid") {
        return res.status(400).json({ success: false, message: "maxScore must be a number" });
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

      const created = await gradingTemplateItemService.create({
        gradingTemplateId: gradingTemplateId.trim(),
        grade: grade.trim(),
        minScore: parsedMinScore,
        maxScore: parsedMaxScore,
        gradePoint: parsedGradePoint,
        ...(remark !== undefined ? { remark } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Grading template item created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create grading template item");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await gradingTemplateItemService.list({
        gradingTemplateId: queryString(req.query, "gradingTemplateId"),
        grade: queryString(req.query, "grade"),
      });

      return res.json({
        success: true,
        message: "Grading template items retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve grading template items");
    }
  },

  /**
   * @openapi
   * /api/v1/grading-template-items/{id}:
   *   get:
   *     summary: Get a grading template item by ID
   *     tags: [GradingTemplateItems]
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
   *         description: Grading template item details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a grading template item
   *     tags: [GradingTemplateItems]
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
   *               minScore:
   *                 type: number
   *               maxScore:
   *                 type: number
   *               gradePoint:
   *                 type: number
   *               remark:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Grading template item updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a grading template item
   *     tags: [GradingTemplateItems]
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
   *         description: Grading template item deleted
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

      const row = await gradingTemplateItemService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Grading template item not found" });
      }

      return res.json({
        success: true,
        message: "Grading template item retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve grading template item");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { grade, minScore, maxScore, gradePoint, remark } = req.body ?? {};
      if (
        grade === undefined &&
        minScore === undefined &&
        maxScore === undefined &&
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

      let parsedMinScore: string | number | undefined;
      if (minScore !== undefined) {
        const parsed = parseBodyDecimal(minScore, "minScore");
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "minScore must be a number" });
        }
        parsedMinScore = parsed;
      }

      let parsedMaxScore: string | number | undefined;
      if (maxScore !== undefined) {
        const parsed = parseBodyDecimal(maxScore, "maxScore");
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "maxScore must be a number" });
        }
        parsedMaxScore = parsed;
      }

      let parsedGradePoint: string | number | undefined;
      if (gradePoint !== undefined) {
        const parsed = parseBodyDecimal(gradePoint, "gradePoint");
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "gradePoint must be a number" });
        }
        parsedGradePoint = parsed;
      }

      const updated = await gradingTemplateItemService.update(id, {
        ...(grade !== undefined ? { grade: grade.trim() } : {}),
        ...(parsedMinScore !== undefined ? { minScore: parsedMinScore } : {}),
        ...(parsedMaxScore !== undefined ? { maxScore: parsedMaxScore } : {}),
        ...(parsedGradePoint !== undefined ? { gradePoint: parsedGradePoint } : {}),
        ...(remark !== undefined ? { remark } : {}),
      });

      return res.json({
        success: true,
        message: "Grading template item updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update grading template item");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await gradingTemplateItemService.delete(id);

      return res.json({
        success: true,
        message: "Grading template item deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete grading template item");
    }
  },
};
