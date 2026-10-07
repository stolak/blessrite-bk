import { Request, Response } from "express";
import { classAssessmentTemplateService } from "../services/classAssessmentTemplateService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/class-assessment-templates:
 *   post:
 *     summary: Assign an assessment template to a class
 *     tags: [ClassAssessmentTemplates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, templateId, sessionId, termId]
 *             properties:
 *               classId:
 *                 type: string
 *               templateId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               gradeTemplateId:
 *                 type: string
 *                 nullable: true
 *               behaviouralTemplateId:
 *                 type: string
 *                 nullable: true
 *               behaviouralGradingTemplateId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Class assessment template created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List class assessment template assignments
 *     tags: [ClassAssessmentTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *       - in: query
 *         name: gradeTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: behaviouralTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: behaviouralGradingTemplateId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Class assessment templates list
 *       500:
 *         description: Server error
 */
export const classAssessmentTemplateController = {
  create: async (req: Request, res: Response) => {
    try {
      const { classId, templateId, sessionId, termId, gradeTemplateId, behaviouralTemplateId, behaviouralGradingTemplateId } =
        req.body ?? {};

      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!templateId || typeof templateId !== "string" || !templateId.trim()) {
        return res.status(400).json({ success: false, message: "templateId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }
      if (!isStringOrNullOrUndefined(gradeTemplateId)) {
        return res.status(400).json({ success: false, message: "gradeTemplateId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(behaviouralTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "behaviouralTemplateId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(behaviouralGradingTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "behaviouralGradingTemplateId must be a string or null" });
      }

      const created = await classAssessmentTemplateService.create({
        classId: classId.trim(),
        templateId: templateId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        ...(gradeTemplateId !== undefined ? { gradeTemplateId: gradeTemplateId?.trim() || null } : {}),
        ...(behaviouralTemplateId !== undefined
          ? { behaviouralTemplateId: behaviouralTemplateId?.trim() || null }
          : {}),
        ...(behaviouralGradingTemplateId !== undefined
          ? { behaviouralGradingTemplateId: behaviouralGradingTemplateId?.trim() || null }
          : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Class assessment template created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create class assessment template");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await classAssessmentTemplateService.list({
        classId: queryString(req.query, "classId"),
        templateId: queryString(req.query, "templateId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        gradeTemplateId: queryString(req.query, "gradeTemplateId"),
        behaviouralTemplateId: queryString(req.query, "behaviouralTemplateId"),
        behaviouralGradingTemplateId: queryString(req.query, "behaviouralGradingTemplateId"),
      });

      return res.json({
        success: true,
        message: "Class assessment templates retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve class assessment templates");
    }
  },

  /**
   * @openapi
   * /api/v1/class-assessment-templates/resolve:
   *   get:
   *     summary: Get or create a class assessment template for a session and term
   *     description: >
   *       Returns the existing assignment for the class, session, and term when present.
   *       Otherwise creates one using the most recent assignment for that class.
   *     tags: [ClassAssessmentTemplates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: classId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: termId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Existing class assessment template returned
   *       201:
   *         description: Class assessment template created from latest class assignment
   *       400:
   *         description: Validation error
   *       404:
   *         description: No prior class assessment template found to copy from
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   */
  resolve: async (req: Request, res: Response) => {
    try {
      const classId = queryString(req.query, "classId");
      const sessionId = queryString(req.query, "sessionId");
      const termId = queryString(req.query, "termId");

      if (!classId) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }

      const existing = await classAssessmentTemplateService.list({
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
      });
      const created = existing.classAssessmentTemplates.length === 0;

      const data = await classAssessmentTemplateService.getOrCreateClassTemplate({
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
      });

      return res.status(created ? 201 : 200).json({
        success: true,
        message: created
          ? "Class assessment template created successfully"
          : "Class assessment template retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to resolve class assessment template");
    }
  },

  /**
   * @openapi
   * /api/v1/class-assessment-templates/{id}:
   *   get:
   *     summary: Get a class assessment template by ID
   *     tags: [ClassAssessmentTemplates]
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
   *         description: Class assessment template details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a class assessment template assignment
   *     tags: [ClassAssessmentTemplates]
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
 *               gradeTemplateId:
 *                 type: string
 *                 nullable: true
 *               behaviouralTemplateId:
 *                 type: string
 *                 nullable: true
 *               behaviouralGradingTemplateId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Class assessment template updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a class assessment template assignment
   *     tags: [ClassAssessmentTemplates]
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
   *         description: Class assessment template deleted
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await classAssessmentTemplateService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Class assessment template not found" });
      }

      return res.json({
        success: true,
        message: "Class assessment template retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve class assessment template");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { templateId, gradeTemplateId, behaviouralTemplateId, behaviouralGradingTemplateId } =
        req.body ?? {};
      if (
        templateId === undefined &&
        gradeTemplateId === undefined &&
        behaviouralTemplateId === undefined &&
        behaviouralGradingTemplateId === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one of templateId, gradeTemplateId, behaviouralTemplateId, or behaviouralGradingTemplateId must be provided",
        });
      }
      if (templateId !== undefined && (typeof templateId !== "string" || !templateId.trim())) {
        return res.status(400).json({ success: false, message: "templateId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(gradeTemplateId)) {
        return res.status(400).json({ success: false, message: "gradeTemplateId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(behaviouralTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "behaviouralTemplateId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(behaviouralGradingTemplateId)) {
        return res
          .status(400)
          .json({ success: false, message: "behaviouralGradingTemplateId must be a string or null" });
      }

      const updated = await classAssessmentTemplateService.update(id, {
        ...(templateId !== undefined ? { templateId: templateId.trim() } : {}),
        ...(gradeTemplateId !== undefined ? { gradeTemplateId: gradeTemplateId?.trim() || null } : {}),
        ...(behaviouralTemplateId !== undefined
          ? { behaviouralTemplateId: behaviouralTemplateId?.trim() || null }
          : {}),
        ...(behaviouralGradingTemplateId !== undefined
          ? { behaviouralGradingTemplateId: behaviouralGradingTemplateId?.trim() || null }
          : {}),
      });

      return res.json({
        success: true,
        message: "Class assessment template updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update class assessment template");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await classAssessmentTemplateService.delete(id);

      return res.json({
        success: true,
        message: "Class assessment template deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete class assessment template");
    }
  },
};
