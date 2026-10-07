import { Request, Response } from "express";
import { assessmentTemplateService } from "../services/assessmentTemplateService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyStatus, parseStatusQuery } from "../utils/assessmentHttp";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/assessment-templates:
 *   post:
 *     summary: Create an assessment template
 *     tags: [AssessmentTemplates]
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
 *               versionId:
 *                 type: string
 *               parentTemplateId:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Assessment template created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List assessment templates
 *     tags: [AssessmentTemplates]
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
 *         name: versionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: parentTemplateId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assessment templates list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const assessmentTemplateController = {
  create: async (req: Request, res: Response) => {
    try {
      const { name, description, versionId, parentTemplateId, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (!isStringOrNullOrUndefined(description)) {
        return res
          .status(400)
          .json({ success: false, message: "description must be a string or null" });
      }
      if (versionId !== undefined && (typeof versionId !== "string" || !versionId.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "versionId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(parentTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "parentTemplateId must be a string or null" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await assessmentTemplateService.create({
        name: name.trim(),
        ...(description !== undefined ? { description } : {}),
        ...(typeof versionId === "string" ? { versionId: versionId.trim() } : {}),
        ...(parentTemplateId !== undefined
          ? { parentTemplateId: parentTemplateId?.trim() || null }
          : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Assessment template created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create assessment template");
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

      const result = await assessmentTemplateService.list({
        q: queryString(req.query, "q"),
        status,
        versionId: queryString(req.query, "versionId"),
        parentTemplateId: queryString(req.query, "parentTemplateId"),
      });

      return res.json({
        success: true,
        message: "Assessment templates retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment templates");
    }
  },

  /**
   * @openapi
   * /api/v1/assessment-templates/{id}:
   *   get:
   *     summary: Get an assessment template by ID
   *     tags: [AssessmentTemplates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: string
   *     responses:
   *       200:
   *         description: Assessment template details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update an assessment template
   *     tags: [AssessmentTemplates]
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
   *               versionId:
   *                 type: string
   *               parentTemplateId:
   *                 type: string
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Assessment template updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete an assessment template
   *     tags: [AssessmentTemplates]
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
   *         description: Assessment template deleted
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

      const row = await assessmentTemplateService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Assessment template not found" });
      }

      return res.json({
        success: true,
        message: "Assessment template retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment template");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { name, description, versionId, parentTemplateId, status } = req.body ?? {};
      const hasName = name !== undefined;
      const hasDescription = description !== undefined;
      const hasVersionId = versionId !== undefined;
      const hasParentTemplateId = parentTemplateId !== undefined;
      const hasStatus = status !== undefined;

      if (!hasName && !hasDescription && !hasVersionId && !hasParentTemplateId && !hasStatus) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be provided",
        });
      }

      if (hasName && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (hasDescription && !isStringOrNullOrUndefined(description)) {
        return res
          .status(400)
          .json({ success: false, message: "description must be a string or null" });
      }
      if (hasVersionId && (typeof versionId !== "string" || !versionId.trim())) {
        return res
          .status(400)
          .json({ success: false, message: "versionId must be a non-empty string" });
      }
      if (hasParentTemplateId && !isStringOrNullOrUndefined(parentTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "parentTemplateId must be a string or null" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (hasStatus && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await assessmentTemplateService.update(id, {
        ...(hasName ? { name: (name as string).trim() } : {}),
        ...(hasDescription ? { description } : {}),
        ...(hasVersionId ? { versionId: (versionId as string).trim() } : {}),
        ...(hasParentTemplateId ? { parentTemplateId: parentTemplateId?.trim() || null } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Assessment template updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update assessment template");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await assessmentTemplateService.delete(id);

      return res.json({
        success: true,
        message: "Assessment template deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete assessment template");
    }
  },
};
