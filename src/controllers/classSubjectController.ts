import { Request, Response } from "express";
import { classSubjectService } from "../services/classSubjectService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/class-subjects:
 *   post:
 *     summary: Assign a subject to a class
 *     tags: [ClassSubjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, subjectId, sessionId]
 *             properties:
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               subjectId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Class subject created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List class subject assignments grouped by class, subclass, session, and term
 *     tags: [ClassSubjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
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
 *     responses:
 *       200:
 *         description: Class subjects report grouped by class, subclass, session, and term
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           classId:
 *                             type: string
 *                           class:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           subclassId:
 *                             type: string
 *                             nullable: true
 *                           subclass:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           sessionId:
 *                             type: string
 *                           session:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           termId:
 *                             type: string
 *                             nullable: true
 *                           term:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           classSubjects:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 subjectId:
 *                                   type: string
 *                                 subject:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: string
 *                                     code:
 *                                       type: string
 *                                     name:
 *                                       type: string
 *                                     status:
 *                                       type: string
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/class-subjects/bulk:
 *   post:
 *     summary: Assign multiple subjects to a class
 *     tags: [ClassSubjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, sessionId, subjectIds]
 *             properties:
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *                 nullable: true
 *               subjectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *     responses:
 *       201:
 *         description: Class subjects created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate subject assignment
 *       500:
 *         description: Server error
 */
export const classSubjectController = {
  createBulk: async (req: Request, res: Response) => {
    try {
      const { classId, subclassId, sessionId, termId, subjectIds } = req.body ?? {};

      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
        return res.status(400).json({ success: false, message: "subjectIds must be a non-empty array" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(termId)) {
        return res.status(400).json({ success: false, message: "termId must be a string or null" });
      }

      for (const subjectId of subjectIds) {
        if (typeof subjectId !== "string" || !subjectId.trim()) {
          return res.status(400).json({ success: false, message: "Each subjectId must be a non-empty string" });
        }
      }

      const created = await classSubjectService.createMany({
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        subjectIds: subjectIds.map((id: string) => id.trim()),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(termId !== undefined ? { termId: termId?.trim() || null } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Class subjects created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create class subjects");
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { classId, subclassId, subjectId, sessionId, termId } = req.body ?? {};

      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!subjectId || typeof subjectId !== "string" || !subjectId.trim()) {
        return res.status(400).json({ success: false, message: "subjectId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(termId)) {
        return res.status(400).json({ success: false, message: "termId must be a string or null" });
      }

      const created = await classSubjectService.create({
        classId: classId.trim(),
        subjectId: subjectId.trim(),
        sessionId: sessionId.trim(),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(termId !== undefined ? { termId: termId?.trim() || null } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Class subject created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create class subject");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await classSubjectService.list({
        classId: queryString(req.query, "classId"),
        subclassId: queryString(req.query, "subclassId"),
        subjectId: queryString(req.query, "subjectId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      return res.json({
        success: true,
        message: "Class subjects retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve class subjects");
    }
  },

  /**
   * @openapi
   * /api/v1/class-subjects/{id}:
   *   get:
   *     summary: Get a class subject by ID
   *     tags: [ClassSubjects]
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
   *         description: Class subject details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a class subject assignment
   *     tags: [ClassSubjects]
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
   *               classId:
   *                 type: string
   *               subclassId:
   *                 type: string
   *                 nullable: true
 *               subjectId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Class subject updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   delete:
   *     summary: Delete a class subject assignment
   *     tags: [ClassSubjects]
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
   *         description: Class subject deleted
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

      const row = await classSubjectService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Class subject not found" });
      }

      return res.json({
        success: true,
        message: "Class subject retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve class subject");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { classId, subclassId, subjectId, sessionId, termId } = req.body ?? {};
      if (
        classId === undefined &&
        subclassId === undefined &&
        subjectId === undefined &&
        sessionId === undefined &&
        termId === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (classId !== undefined && (typeof classId !== "string" || !classId.trim())) {
        return res.status(400).json({ success: false, message: "classId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (subjectId !== undefined && (typeof subjectId !== "string" || !subjectId.trim())) {
        return res.status(400).json({ success: false, message: "subjectId must be a non-empty string" });
      }
      if (sessionId !== undefined && (typeof sessionId !== "string" || !sessionId.trim())) {
        return res.status(400).json({ success: false, message: "sessionId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(termId)) {
        return res.status(400).json({ success: false, message: "termId must be a string or null" });
      }

      const updated = await classSubjectService.update(id, {
        ...(classId !== undefined ? { classId: classId.trim() } : {}),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(subjectId !== undefined ? { subjectId: subjectId.trim() } : {}),
        ...(sessionId !== undefined ? { sessionId: sessionId.trim() } : {}),
        ...(termId !== undefined ? { termId: termId?.trim() || null } : {}),
      });

      return res.json({
        success: true,
        message: "Class subject updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update class subject");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await classSubjectService.delete(id);

      return res.json({
        success: true,
        message: "Class subject deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete class subject");
    }
  },
};
