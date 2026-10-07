import { Request, Response } from "express";
import { teacherSubjectService } from "../services/teacherSubjectService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isStringOrNullOrUndefined } from "../utils/request";
import { getAuthenticatedUserId } from "../middlewares/auth";
import { resolveStaffId } from "../utils/staffContext";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/teacher-subjects:
 *   post:
 *     summary: Assign a subject to a teacher for a class, subclass, session, and term
 *     tags: [TeacherSubjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, subjectId, classId, sessionId, termId]
 *             properties:
 *               staffId:
 *                 type: string
 *               subjectId:
 *                 type: string
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               userId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional; defaults to the staff member linked user account
 *     responses:
 *       201:
 *         description: Teacher subject created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List teacher subject assignments
 *     tags: [TeacherSubjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subclassId
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
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Teacher subjects retrieved
 *       500:
 *         description: Server error
 */
/**
 * @openapi
 * /api/v1/teacher-subjects/bulk:
 *   post:
 *     summary: Assign multiple subjects to a teacher for a class, subclass, session, and term
 *     tags: [TeacherSubjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, classId, sessionId, termId, subjectIds]
 *             properties:
 *               staffId:
 *                 type: string
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *                 nullable: true
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               userId:
 *                 type: string
 *                 nullable: true
 *               subjectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *     responses:
 *       201:
 *         description: Teacher subjects created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 */
export const teacherSubjectController = {
  createBulk: async (req: Request, res: Response) => {
    try {
      const { staffId, classId, subclassId, sessionId, termId, userId, subjectIds } = req.body ?? {};

      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }
      if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
        return res.status(400).json({ success: false, message: "subjectIds must be a non-empty array" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(userId)) {
        return res.status(400).json({ success: false, message: "userId must be a string or null" });
      }

      for (const subjectId of subjectIds) {
        if (typeof subjectId !== "string" || !subjectId.trim()) {
          return res
            .status(400)
            .json({ success: false, message: "Each subjectId must be a non-empty string" });
        }
      }

      const created = await teacherSubjectService.createMany({
        staffId: staffId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        subjectIds: subjectIds.map((id: string) => id.trim()),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(userId !== undefined ? { userId: userId?.trim() || null } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Teacher subjects created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create teacher subjects");
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { staffId, subjectId, classId, subclassId, sessionId, termId, userId } = req.body ?? {};

      if (!staffId || typeof staffId !== "string" || !staffId.trim()) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!subjectId || typeof subjectId !== "string" || !subjectId.trim()) {
        return res.status(400).json({ success: false, message: "subjectId is required" });
      }
      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(userId)) {
        return res.status(400).json({ success: false, message: "userId must be a string or null" });
      }

      const created = await teacherSubjectService.create({
        staffId: staffId.trim(),
        subjectId: subjectId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(userId !== undefined ? { userId: userId?.trim() || null } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Teacher subject created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create teacher subject");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await teacherSubjectService.list({
        staffId: queryString(req.query, "staffId"),
        subjectId: queryString(req.query, "subjectId"),
        classId: queryString(req.query, "classId"),
        subclassId: queryString(req.query, "subclassId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
        userId: queryString(req.query, "userId"),
      });

      return res.json({
        success: true,
        message: "Teacher subjects retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve teacher subjects");
    }
  },

  /**
   * @openapi
   * /api/v1/teacher-subjects/me:
   *   get:
   *     summary: List teacher subject assignments for the authenticated staff user
   *     description: |
   *       Uses the logged-in staff user's account to resolve staffId from Staff.userId,
   *       then returns their subject assignments. Optional filters apply on top of staff scope.
   *     tags: [TeacherSubjects]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: subjectId
   *         schema:
   *           type: string
   *       - in: query
   *         name: classId
   *         schema:
   *           type: string
   *       - in: query
   *         name: subclassId
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
   *         description: Teacher subjects for the authenticated staff member
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: User is not staff
   *       404:
   *         description: No linked staff profile
   *       500:
   *         description: Server error
   */
  listMine: async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const staffId = await resolveStaffId(userId);
      const result = await teacherSubjectService.list({
        staffId,
        subjectId: queryString(req.query, "subjectId"),
        classId: queryString(req.query, "classId"),
        subclassId: queryString(req.query, "subclassId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      return res.json({
        success: true,
        message: "Teacher subjects retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve teacher subjects");
    }
  },

  /**
   * @openapi
   * /api/v1/teacher-subjects/{id}:
   *   get:
   *     summary: Get a teacher subject assignment by ID
   *     tags: [TeacherSubjects]
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
   *         description: Teacher subject details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a teacher subject assignment
   *     tags: [TeacherSubjects]
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
   *               staffId:
   *                 type: string
   *               subjectId:
   *                 type: string
   *               classId:
   *                 type: string
   *               subclassId:
   *                 type: string
   *                 nullable: true
   *               sessionId:
   *                 type: string
   *               termId:
   *                 type: string
   *               userId:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Teacher subject updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a teacher subject assignment
   *     tags: [TeacherSubjects]
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
   *         description: Teacher subject deleted
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

      const row = await teacherSubjectService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Teacher subject not found" });
      }

      return res.json({
        success: true,
        message: "Teacher subject retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve teacher subject");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const { staffId, subjectId, classId, subclassId, sessionId, termId, userId } = req.body ?? {};
      if (
        staffId === undefined &&
        subjectId === undefined &&
        classId === undefined &&
        subclassId === undefined &&
        sessionId === undefined &&
        termId === undefined &&
        userId === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (staffId !== undefined && (typeof staffId !== "string" || !staffId.trim())) {
        return res.status(400).json({ success: false, message: "staffId must be a non-empty string" });
      }
      if (subjectId !== undefined && (typeof subjectId !== "string" || !subjectId.trim())) {
        return res.status(400).json({ success: false, message: "subjectId must be a non-empty string" });
      }
      if (classId !== undefined && (typeof classId !== "string" || !classId.trim())) {
        return res.status(400).json({ success: false, message: "classId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(subclassId)) {
        return res.status(400).json({ success: false, message: "subclassId must be a string or null" });
      }
      if (sessionId !== undefined && (typeof sessionId !== "string" || !sessionId.trim())) {
        return res.status(400).json({ success: false, message: "sessionId must be a non-empty string" });
      }
      if (termId !== undefined && (typeof termId !== "string" || !termId.trim())) {
        return res.status(400).json({ success: false, message: "termId must be a non-empty string" });
      }
      if (!isStringOrNullOrUndefined(userId)) {
        return res.status(400).json({ success: false, message: "userId must be a string or null" });
      }

      const updated = await teacherSubjectService.update(id, {
        ...(staffId !== undefined ? { staffId: staffId.trim() } : {}),
        ...(subjectId !== undefined ? { subjectId: subjectId.trim() } : {}),
        ...(classId !== undefined ? { classId: classId.trim() } : {}),
        ...(subclassId !== undefined ? { subclassId: subclassId?.trim() || null } : {}),
        ...(sessionId !== undefined ? { sessionId: sessionId.trim() } : {}),
        ...(termId !== undefined ? { termId: termId.trim() } : {}),
        ...(userId !== undefined ? { userId: userId?.trim() || null } : {}),
      });

      return res.json({
        success: true,
        message: "Teacher subject updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update teacher subject");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await teacherSubjectService.delete(id);

      return res.json({
        success: true,
        message: "Teacher subject deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete teacher subject");
    }
  },
};
