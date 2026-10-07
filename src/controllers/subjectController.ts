import { Request, Response } from "express";
import { subjectService } from "../services/subjectService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyStatus, parseStatusQuery } from "../utils/assessmentHttp";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/subjects:
 *   post:
 *     summary: Create a subject
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       201:
 *         description: Subject created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate subject code
 *       500:
 *         description: Server error
 *   get:
 *     summary: List subjects
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by code or name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *     responses:
 *       200:
 *         description: Subjects list
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export const subjectController = {
  create: async (req: Request, res: Response) => {
    try {
      const { code, name, status } = req.body ?? {};

      if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ success: false, message: "code is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const created = await subjectService.create({
        code: code.trim(),
        name: name.trim(),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Subject created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create subject");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const statusParam = queryString(req.query, "status");
      const parsedStatus = statusParam !== undefined ? parseStatusQuery(statusParam) : undefined;
      if (statusParam !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const result = await subjectService.list({
        q: queryString(req.query, "q"),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Subjects retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve subjects");
    }
  },

  /**
   * @openapi
   * /api/v1/subjects/{id}:
   *   get:
   *     summary: Get a subject by ID
   *     tags: [Subjects]
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
   *         description: Subject details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a subject
   *     tags: [Subjects]
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
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *     responses:
 *       200:
 *         description: Subject updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate subject code
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete a subject
 *     tags: [Subjects]
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
 *         description: Subject deleted
 *       404:
 *         description: Not found
 *       409:
 *         description: Referenced by other records
 *       500:
 *         description: Server error
 */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await subjectService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Subject not found" });
      }

      return res.json({
        success: true,
        message: "Subject retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve subject");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { code, name, status } = req.body ?? {};
      if (code === undefined && name === undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "At least one of code, name, or status must be provided",
        });
      }
      if (code !== undefined && (typeof code !== "string" || !code.trim())) {
        return res.status(400).json({ success: false, message: "code must be a non-empty string" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      const parsedStatus = parseBodyStatus(status);
      if (status !== undefined && parsedStatus === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await subjectService.update(id, {
        ...(code !== undefined ? { code: code.trim() } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
      });

      return res.json({
        success: true,
        message: "Subject updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update subject");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await subjectService.delete(id);

      return res.json({
        success: true,
        message: "Subject deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete subject");
    }
  },
};
