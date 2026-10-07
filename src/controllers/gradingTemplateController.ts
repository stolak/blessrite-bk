import { Request, Response } from "express";
import { gradingTemplateService } from "../services/gradingTemplateService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyBoolean, parseOptionalBoolean } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined, parseIntOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/grading-templates:
 *   post:
 *     summary: Create a grading template
 *     tags: [GradingTemplates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, version]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               version:
 *                 type: string
 *               isLocked:
 *                 type: boolean
 *               parentId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Grading template created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List grading templates
 *     tags: [GradingTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         schema:
 *           type: string
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
 *         description: Grading templates list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const gradingTemplateController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, description, version, isLocked, parentId } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      if (!isStringOrNullOrUndefined(description)) {
        return res
          .status(400)
          .json({ success: false, message: "description must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(parentId)) {
        return res
          .status(400)
          .json({ success: false, message: "parentId must be a string or null" });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }

      const created = await gradingTemplateService.create({
        name: name.trim(),
        version: parseIntOrUndefined(version) ?? 1,
        ...(description !== undefined ? { description } : {}),
        ...(parsedIsLocked !== "missing" ? { isLocked: parsedIsLocked } : {}),
        ...(parentId !== undefined ? { parentId: parentId?.trim() || null } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Grading template created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create grading template");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const isLockedRaw = req.query.isLocked;
      const isLockedParsed = parseOptionalBoolean(isLockedRaw);
      if (isLockedRaw !== undefined && isLockedParsed === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be true or false" });
      }

      const result = await gradingTemplateService.list({
        q: queryString(req.query, "q"),
        version: parseIntOrUndefined(queryString(req.query, "version")),
        parentId: queryString(req.query, "parentId"),
        ...(isLockedParsed !== undefined && isLockedParsed !== "invalid"
          ? { isLocked: isLockedParsed }
          : {}),
      });

      return res.json({
        success: true,
        message: "Grading templates retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve grading templates");
    }
  },

  /**
   * @openapi
   * /api/v1/grading-templates/{id}:
   *   get:
   *     summary: Get a grading template by ID
   *     tags: [GradingTemplates]
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
   *         description: Grading template details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a grading template
   *     tags: [GradingTemplates]
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
   *                 type: string
   *               isLocked:
   *                 type: boolean
   *               parentId:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Grading template updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a grading template
   *     tags: [GradingTemplates]
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
   *         description: Grading template deleted
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

      const row = await gradingTemplateService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Grading template not found" });
      }

      return res.json({
        success: true,
        message: "Grading template retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve grading template");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { name, description, version, isLocked, parentId } = req.body ?? {};
      if (
        name === undefined &&
        description === undefined &&
        version === undefined &&
        isLocked === undefined &&
        parentId === undefined
      ) {
        return res
          .status(400)
          .json({ success: false, message: "At least one field must be provided" });
      }

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (description !== undefined && !isStringOrNullOrUndefined(description)) {
        return res
          .status(400)
          .json({ success: false, message: "description must be a string or null" });
      }
      if (version !== undefined && (typeof version !== "string" || !version.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "version must be a non-empty string" });
      }
      if (parentId !== undefined && !isStringOrNullOrUndefined(parentId)) {
        return res
          .status(400)
          .json({ success: false, message: "parentId must be a string or null" });
      }

      const parsedIsLocked = parseBodyBoolean(isLocked);
      if (isLocked !== undefined && parsedIsLocked === "invalid") {
        return res.status(400).json({ success: false, message: "isLocked must be a boolean" });
      }

      const updated = await gradingTemplateService.update(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(version !== undefined ? { version: Number(version) } : {}),
        ...(parsedIsLocked !== "missing" && parsedIsLocked !== "invalid"
          ? { isLocked: parsedIsLocked }
          : {}),
        ...(parentId !== undefined ? { parentId: parentId?.trim() || null } : {}),
      });

      return res.json({
        success: true,
        message: "Grading template updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update grading template");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await gradingTemplateService.delete(id);

      return res.json({
        success: true,
        message: "Grading template deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete grading template");
    }
  },
};
