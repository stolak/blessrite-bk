import { Request, Response } from "express";
import { defaultClassRemarkSetupService } from "../services/defaultClassRemarkSetupService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/default-class-remark-setups:
 *   post:
 *     summary: Create or update default class remark setup for a class boundary band
 *     tags: [DefaultClassRemarkSetups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, teacherRemark, lowerBoundary, upperBoundary]
 *             properties:
 *               classId:
 *                 type: string
 *               teacherRemark:
 *                 type: string
 *               lowerBoundary:
 *                 type: number
 *               upperBoundary:
 *                 type: number
 *               parentRemark:
 *                 type: string
 *                 nullable: true
 *               principalRemark:
 *                 type: string
 *                 nullable: true
 *               headTeacherRemark:
 *                 type: string
 *                 nullable: true
 *               classTeacherRemark:
 *                 type: string
 *                 nullable: true
 *               otherRemark:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Default class remark setup created
 *       200:
 *         description: Default class remark setup updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Overlapping boundary range for class
 *       500:
 *         description: Server error
 *   get:
 *     summary: List default class remark setups
 *     tags: [DefaultClassRemarkSetups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default class remark setups list
 *       500:
 *         description: Server error
 */
export const defaultClassRemarkSetupController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        classId,
        teacherRemark,
        lowerBoundary,
        upperBoundary,
        parentRemark,
        principalRemark,
        headTeacherRemark,
        classTeacherRemark,
        otherRemark,
      } = req.body ?? {};

      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!teacherRemark || typeof teacherRemark !== "string" || !teacherRemark.trim()) {
        return res.status(400).json({ success: false, message: "teacherRemark is required" });
      }

      const parsedLower = parseBodyDecimal(lowerBoundary, "lowerBoundary");
      if (parsedLower === "missing") {
        return res.status(400).json({ success: false, message: "lowerBoundary is required" });
      }
      if (parsedLower === "invalid") {
        return res.status(400).json({ success: false, message: "lowerBoundary must be a number" });
      }

      const parsedUpper = parseBodyDecimal(upperBoundary, "upperBoundary");
      if (parsedUpper === "missing") {
        return res.status(400).json({ success: false, message: "upperBoundary is required" });
      }
      if (parsedUpper === "invalid") {
        return res.status(400).json({ success: false, message: "upperBoundary must be a number" });
      }

      for (const [field, value] of [
        ["parentRemark", parentRemark],
        ["principalRemark", principalRemark],
        ["headTeacherRemark", headTeacherRemark],
        ["classTeacherRemark", classTeacherRemark],
        ["otherRemark", otherRemark],
      ] as const) {
        if (!isStringOrNullOrUndefined(value)) {
          return res.status(400).json({ success: false, message: `${field} must be a string or null` });
        }
      }

      const { defaultClassRemarkSetup, created } = await defaultClassRemarkSetupService.create({
        classId: classId.trim(),
        teacherRemark: teacherRemark.trim(),
        lowerBoundary: parsedLower,
        upperBoundary: parsedUpper,
        ...(parentRemark !== undefined ? { parentRemark } : {}),
        ...(principalRemark !== undefined ? { principalRemark } : {}),
        ...(headTeacherRemark !== undefined ? { headTeacherRemark } : {}),
        ...(classTeacherRemark !== undefined ? { classTeacherRemark } : {}),
        ...(otherRemark !== undefined ? { otherRemark } : {}),
      });

      return res.status(created ? 201 : 200).json({
        success: true,
        message: created
          ? "Default class remark setup created successfully"
          : "Default class remark setup updated successfully",
        data: defaultClassRemarkSetup,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create default class remark setup");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await defaultClassRemarkSetupService.list({
        classId: queryString(req.query, "classId"),
      });

      return res.json({
        success: true,
        message: "Default class remark setups retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve default class remark setups");
    }
  },

  /**
   * @openapi
   * /api/v1/default-class-remark-setups/{id}:
   *   get:
   *     summary: Get a default class remark setup by ID
   *     tags: [DefaultClassRemarkSetups]
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
   *         description: Default class remark setup details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a default class remark setup
   *     tags: [DefaultClassRemarkSetups]
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
   *               teacherRemark:
   *                 type: string
   *               lowerBoundary:
   *                 type: number
   *               upperBoundary:
   *                 type: number
   *               parentRemark:
   *                 type: string
   *                 nullable: true
   *               principalRemark:
   *                 type: string
   *                 nullable: true
   *               headTeacherRemark:
   *                 type: string
   *                 nullable: true
   *               classTeacherRemark:
   *                 type: string
   *                 nullable: true
   *               otherRemark:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Default class remark setup updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Overlapping boundary range for class
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a default class remark setup
   *     tags: [DefaultClassRemarkSetups]
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
   *         description: Default class remark setup deleted
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await defaultClassRemarkSetupService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Default class remark setup not found" });
      }

      return res.json({
        success: true,
        message: "Default class remark setup retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve default class remark setup");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        teacherRemark,
        lowerBoundary,
        upperBoundary,
        parentRemark,
        principalRemark,
        headTeacherRemark,
        classTeacherRemark,
        otherRemark,
      } = req.body ?? {};

      if (
        teacherRemark === undefined &&
        lowerBoundary === undefined &&
        upperBoundary === undefined &&
        parentRemark === undefined &&
        principalRemark === undefined &&
        headTeacherRemark === undefined &&
        classTeacherRemark === undefined &&
        otherRemark === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (teacherRemark !== undefined && (typeof teacherRemark !== "string" || !teacherRemark.trim())) {
        return res.status(400).json({ success: false, message: "teacherRemark must be a non-empty string" });
      }

      const parsedLower = parseBodyDecimal(lowerBoundary, "lowerBoundary");
      if (lowerBoundary !== undefined && parsedLower === "invalid") {
        return res.status(400).json({ success: false, message: "lowerBoundary must be a number" });
      }
      const parsedUpper = parseBodyDecimal(upperBoundary, "upperBoundary");
      if (upperBoundary !== undefined && parsedUpper === "invalid") {
        return res.status(400).json({ success: false, message: "upperBoundary must be a number" });
      }

      for (const [field, value] of [
        ["parentRemark", parentRemark],
        ["principalRemark", principalRemark],
        ["headTeacherRemark", headTeacherRemark],
        ["classTeacherRemark", classTeacherRemark],
        ["otherRemark", otherRemark],
      ] as const) {
        if (value !== undefined && !isStringOrNullOrUndefined(value)) {
          return res.status(400).json({ success: false, message: `${field} must be a string or null` });
        }
      }

      const updated = await defaultClassRemarkSetupService.update(id, {
        ...(teacherRemark !== undefined ? { teacherRemark: teacherRemark.trim() } : {}),
        ...(parsedLower !== "missing" && parsedLower !== "invalid" ? { lowerBoundary: parsedLower } : {}),
        ...(parsedUpper !== "missing" && parsedUpper !== "invalid" ? { upperBoundary: parsedUpper } : {}),
        ...(parentRemark !== undefined ? { parentRemark } : {}),
        ...(principalRemark !== undefined ? { principalRemark } : {}),
        ...(headTeacherRemark !== undefined ? { headTeacherRemark } : {}),
        ...(classTeacherRemark !== undefined ? { classTeacherRemark } : {}),
        ...(otherRemark !== undefined ? { otherRemark } : {}),
      });

      return res.json({
        success: true,
        message: "Default class remark setup updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update default class remark setup");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await defaultClassRemarkSetupService.delete(id);

      return res.json({
        success: true,
        message: "Default class remark setup deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete default class remark setup");
    }
  },
};
