import { Request, Response } from "express";
import { assessmentComponentService } from "../services/assessmentComponentService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import {
  parseBodyBoolean,
  parseBodyDecimal,
  parseBodyInt,
  parseBodyStatus,
  parseOptionalBoolean,
  parseStatusQuery,
} from "../utils/assessmentHttp";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/assessment-components:
 *   post:
 *     summary: Create an assessment component
 *     tags: [AssessmentComponents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId, name, maxScore, weight, orderNo]
 *             properties:
 *               templateId:
 *                 type: string
 *               name:
 *                 type: string
 *               shortName:
 *                 type: string
 *                 nullable: true
 *                 description: Optional; defaults to name when omitted
 *               maxScore:
 *                 type: number
 *               weight:
 *                 type: number
 *               orderNo:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               isLocked:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Assessment component created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List assessment components
 *     tags: [AssessmentComponents]
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
 *         name: templateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isLocked
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Assessment components list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const assessmentComponentController = {
  create: async (req: Request, res: Response) => {
    try {
      const { templateId, name, shortName, maxScore, weight, orderNo, status, isLocked } =
        req.body ?? {};

      if (!templateId || typeof templateId !== "string" || !templateId.trim()) {
        return res.status(400).json({ success: false, message: "templateId is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (
        shortName !== undefined &&
        shortName !== null &&
        typeof shortName !== "string"
      ) {
        return res.status(400).json({ success: false, message: "shortName must be a string or null" });
      }

      const parsedMaxScore = parseBodyDecimal(maxScore, "maxScore");
      if (parsedMaxScore === "missing") {
        return res.status(400).json({ success: false, message: "maxScore is required" });
      }
      if (parsedMaxScore === "invalid") {
        return res.status(400).json({ success: false, message: "maxScore must be a number" });
      }

      const parsedWeight = parseBodyDecimal(weight, "weight");
      if (parsedWeight === "missing") {
        return res.status(400).json({ success: false, message: "weight is required" });
      }
      if (parsedWeight === "invalid") {
        return res.status(400).json({ success: false, message: "weight must be a number" });
      }

      const parsedOrderNo = parseBodyInt(orderNo);
      if (parsedOrderNo === "missing") {
        return res.status(400).json({ success: false, message: "orderNo is required" });
      }
      if (parsedOrderNo === "invalid") {
        return res.status(400).json({ success: false, message: "orderNo must be an integer" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }

      const created = await assessmentComponentService.create({
        templateId: templateId.trim(),
        name: name.trim(),
        ...(shortName !== undefined
          ? { shortName: shortName === null ? null : String(shortName).trim() || null }
          : {}),
        maxScore: parsedMaxScore,
        weight: parsedWeight,
        orderNo: parsedOrderNo,
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedIsLocked !== "missing" ? { isLocked: parsedIsLocked } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Assessment component created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create assessment component");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const statusRaw = queryString(req.query, "status");
      const status = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const isLockedRaw = req.query.isLocked;
      const isLockedParsed = parseOptionalBoolean(isLockedRaw);
      if (isLockedRaw !== undefined && isLockedParsed === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be true or false" });
      }

      const result = await assessmentComponentService.list({
        q: queryString(req.query, "q"),
        status,
        templateId: queryString(req.query, "templateId"),
        ...(isLockedParsed !== undefined && isLockedParsed !== "invalid"
          ? { isLocked: isLockedParsed }
          : {}),
      });

      return res.json({
        success: true,
        message: "Assessment components retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment components");
    }
  },

  /**
   * @openapi
   * /api/v1/assessment-components/{id}:
   *   get:
   *     summary: Get an assessment component by ID
   *     tags: [AssessmentComponents]
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
   *         description: Assessment component details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update an assessment component
   *     tags: [AssessmentComponents]
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
 *               templateId:
 *                 type: string
 *               name:
 *                 type: string
 *               shortName:
 *                 type: string
 *                 nullable: true
 *               maxScore:
 *                 type: number
 *               weight:
 *                 type: number
 *               orderNo:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *               isLocked:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Assessment component updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete an assessment component
 *     tags: [AssessmentComponents]
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
   *         description: Assessment component deleted
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

      const row = await assessmentComponentService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Assessment component not found" });
      }

      return res.json({
        success: true,
        message: "Assessment component retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment component");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { templateId, name, shortName, maxScore, weight, orderNo, status, isLocked } =
        req.body ?? {};
      const fields = { templateId, name, shortName, maxScore, weight, orderNo, status, isLocked };
      if (!Object.values(fields).some((v) => v !== undefined)) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (templateId !== undefined && (typeof templateId !== "string" || !templateId.trim())) {
        return res.status(400).json({ success: false, message: "templateId must be a non-empty string" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (
        shortName !== undefined &&
        shortName !== null &&
        typeof shortName !== "string"
      ) {
        return res.status(400).json({ success: false, message: "shortName must be a string or null" });
      }

      let parsedMaxScore: string | number | undefined;
      if (maxScore !== undefined) {
        const parsed = parseBodyDecimal(maxScore, "maxScore");
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "maxScore must be a number" });
        }
        parsedMaxScore = parsed;
      }

      let parsedWeight: string | number | undefined;
      if (weight !== undefined) {
        const parsed = parseBodyDecimal(weight, "weight");
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "weight must be a number" });
        }
        parsedWeight = parsed;
      }

      let parsedOrderNo: number | undefined;
      if (orderNo !== undefined) {
        const parsed = parseBodyInt(orderNo);
        if (parsed === "invalid" || parsed === "missing") {
          return res.status(400).json({ success: false, message: "orderNo must be an integer" });
        }
        parsedOrderNo = parsed;
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (isLocked !== undefined && parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }

      const updated = await assessmentComponentService.update(id, {
        ...(templateId !== undefined ? { templateId: templateId.trim() } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(shortName !== undefined
          ? { shortName: shortName === null ? null : String(shortName).trim() || null }
          : {}),
        ...(parsedMaxScore !== undefined ? { maxScore: parsedMaxScore } : {}),
        ...(parsedWeight !== undefined ? { weight: parsedWeight } : {}),
        ...(parsedOrderNo !== undefined ? { orderNo: parsedOrderNo } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(parsedIsLocked !== "missing" && parsedIsLocked !== "invalid"
          ? { isLocked: parsedIsLocked }
          : {}),
      });

      return res.json({
        success: true,
        message: "Assessment component updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update assessment component");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await assessmentComponentService.delete(id);

      return res.json({
        success: true,
        message: "Assessment component deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete assessment component");
    }
  },
};
