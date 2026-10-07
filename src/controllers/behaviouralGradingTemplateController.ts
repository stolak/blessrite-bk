import { Request, Response } from "express";
import { behaviouralGradingTemplateService } from "../services/behaviouralGradingTemplateService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyBoolean, parseBodyStatus, parseOptionalBoolean, parseStatusQuery } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined, parseIntOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/behavioural-grading-templates:
 *   post:
 *     summary: Create a behavioural grading template
 *     tags: [BehaviouralGradingTemplates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               version:
 *                 type: integer
 *               isLocked:
 *                 type: boolean
 *               parentId:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Behavioural grading template created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List behavioural grading templates
 *     tags: [BehaviouralGradingTemplates]
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
 *         name: version
 *         schema:
 *           type: integer
 *       - in: query
 *         name: isLocked
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Behavioural grading templates list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const behaviouralGradingTemplateController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, description, version, isLocked, parentId, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (!isStringOrNullOrUndefined(description)) {
        return res.status(400).json({ success: false, message: "description must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(parentId)) {
        return res.status(400).json({ success: false, message: "parentId must be a string or null" });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }
      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const created = await behaviouralGradingTemplateService.create({
        name: name.trim(),
        version: parseIntOrUndefined(version) ?? 1,
        ...(description !== undefined ? { description } : {}),
        ...(parsedIsLocked !== "missing" ? { isLocked: parsedIsLocked } : {}),
        ...(parentId !== undefined ? { parentId: parentId?.trim() || null } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Behavioural grading template created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create behavioural grading template");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const statusRaw = queryString(req.query, "status");
      const statusParsed = parseStatusQuery(statusRaw);
      if (typeof statusRaw === "string" && statusParsed === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, Archived, or All" });
      }

      const isLockedRaw = req.query.isLocked;
      const isLockedParsed = parseOptionalBoolean(isLockedRaw);
      if (isLockedRaw !== undefined && isLockedParsed === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be true or false" });
      }

      const result = await behaviouralGradingTemplateService.list({
        q: queryString(req.query, "q"),
        ...(statusParsed !== undefined ? { status: statusParsed } : {}),
        version: parseIntOrUndefined(queryString(req.query, "version")),
        parentId: queryString(req.query, "parentId"),
        ...(isLockedParsed !== undefined && isLockedParsed !== "invalid" ? { isLocked: isLockedParsed } : {}),
      });

      return res.json({
        success: true,
        message: "Behavioural grading templates retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural grading templates");
    }
  },

  /**
   * @openapi
   * /api/v1/behavioural-grading-templates/{id}:
   *   get:
   *     summary: Get a behavioural grading template by ID
   *     tags: [BehaviouralGradingTemplates]
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
   *         description: Behavioural grading template details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a behavioural grading template
   *     tags: [BehaviouralGradingTemplates]
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
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *                 nullable: true
   *               version:
   *                 type: integer
   *               isLocked:
   *                 type: boolean
   *               parentId:
   *                 type: string
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Behavioural grading template updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a behavioural grading template
   *     tags: [BehaviouralGradingTemplates]
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
   *         description: Behavioural grading template deleted
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

      const row = await behaviouralGradingTemplateService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Behavioural grading template not found" });
      }

      return res.json({
        success: true,
        message: "Behavioural grading template retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve behavioural grading template");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { name, description, version, isLocked, parentId, status } = req.body ?? {};
      if (
        name === undefined &&
        description === undefined &&
        version === undefined &&
        isLocked === undefined &&
        parentId === undefined &&
        status === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (description !== undefined && !isStringOrNullOrUndefined(description)) {
        return res.status(400).json({ success: false, message: "description must be a string or null" });
      }
      if (parentId !== undefined && !isStringOrNullOrUndefined(parentId)) {
        return res.status(400).json({ success: false, message: "parentId must be a string or null" });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (isLocked !== undefined && parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }
      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or Archived" });
      }

      const updated = await behaviouralGradingTemplateService.update(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(version !== undefined ? { version: Number(version) } : {}),
        ...(parsedIsLocked !== "missing" && parsedIsLocked !== "invalid" ? { isLocked: parsedIsLocked } : {}),
        ...(parentId !== undefined ? { parentId: parentId?.trim() || null } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Behavioural grading template updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update behavioural grading template");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await behaviouralGradingTemplateService.delete(id);

      return res.json({
        success: true,
        message: "Behavioural grading template deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete behavioural grading template");
    }
  },
};
