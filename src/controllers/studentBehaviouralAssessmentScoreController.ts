import { Request, Response } from "express";
import { studentBehaviouralAssessmentScoreService } from "../services/studentBehaviouralAssessmentScoreService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { parseBodyDecimal } from "../utils/assessmentHttp";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/student-behavioural-assessment-scores/bulk:
 *   post:
 *     summary: Bulk upsert student behavioural assessment scores for a component
 *     tags: [StudentBehaviouralAssessmentScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [behaviouralAssessmentComponentId, classId, sessionId, termId, studentScores]
 *             properties:
 *               behaviouralAssessmentComponentId:
 *                 type: string
 *               classId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               studentScores:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [studentId, score]
 *                   properties:
 *                     studentId:
 *                       type: string
 *                     score:
 *                       type: number
 *                     subclassId:
 *                       type: string
 *                       description: Optional; defaults to the student's assigned sub-class
 *     responses:
 *       201:
 *         description: Student behavioural assessment scores saved
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 * /api/v1/student-behavioural-assessment-scores/bulk/student:
 *   post:
 *     summary: Bulk upsert behavioural assessment scores for one student
 *     tags: [StudentBehaviouralAssessmentScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, classId, sessionId, termId, behaviouralScores]
 *             properties:
 *               studentId:
 *                 type: string
 *               classId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *               behaviouralScores:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [behaviouralAssessmentComponentId, score]
 *                   properties:
 *                     behaviouralAssessmentComponentId:
 *                       type: string
 *                     score:
 *                       type: number
 *     responses:
 *       201:
 *         description: Student behavioural assessment scores saved
 *       400:
 *         description: Validation error (including duplicate component IDs)
 *       500:
 *         description: Server error
 * /api/v1/student-behavioural-assessment-scores/student-scores:
 *   get:
 *     summary: Get behavioural scores for one student across all template components
 *     description: >
 *       Resolves components from the class behavioural template assignment and grades each score
 *       using the class behavioural grading template. Returns score 0 for components with no
 *       recorded score yet (grade NA when no grading template or score is out of range).
 *     tags: [StudentBehaviouralAssessmentScores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Student behavioural scores with component details; missing scores return 0
 *       400:
 *         description: Validation error
 *       404:
 *         description: Student or template assignment not found
 *       500:
 *         description: Server error
 * /api/v1/student-behavioural-assessment-scores:
 *   post:
 *     summary: Create a student behavioural assessment score
 *     tags: [StudentBehaviouralAssessmentScores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - behaviouralAssessmentComponentId
 *               - score
 *               - classId
 *               - subclassId
 *               - sessionId
 *               - termId
 *             properties:
 *               studentId:
 *                 type: string
 *               behaviouralAssessmentComponentId:
 *                 type: string
 *               score:
 *                 type: number
 *               classId:
 *                 type: string
 *               subclassId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               termId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Student behavioural assessment score created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 *       500:
 *         description: Server error
 *   get:
 *     summary: List student behavioural assessment scores
 *     tags: [StudentBehaviouralAssessmentScores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: behaviouralAssessmentComponentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: behaviourTemplateId
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
 *         description: Student behavioural assessment scores list
 *       500:
 *         description: Server error
 */
export const studentBehaviouralAssessmentScoreController = {
  upsertBulkForStudent: async (req: Request, res: Response) => {
    try {
      const { studentId, classId, sessionId, termId, behaviouralScores } = req.body ?? {};

      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
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
      if (!Array.isArray(behaviouralScores) || behaviouralScores.length === 0) {
        return res.status(400).json({ success: false, message: "behaviouralScores must be a non-empty array" });
      }

      for (let i = 0; i < behaviouralScores.length; i++) {
        const entry = behaviouralScores[i];
        if (!entry || typeof entry !== "object") {
          return res.status(400).json({ success: false, message: `behaviouralScores[${i}] must be an object` });
        }
        const { behaviouralAssessmentComponentId, score } = entry as {
          behaviouralAssessmentComponentId?: unknown;
          score?: unknown;
        };
        if (
          !behaviouralAssessmentComponentId ||
          typeof behaviouralAssessmentComponentId !== "string" ||
          !behaviouralAssessmentComponentId.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: `behaviouralScores[${i}].behaviouralAssessmentComponentId is required`,
          });
        }
        const parsedScore = parseBodyDecimal(score, "score");
        if (parsedScore === "missing") {
          return res.status(400).json({ success: false, message: `behaviouralScores[${i}].score is required` });
        }
        if (parsedScore === "invalid") {
          return res.status(400).json({ success: false, message: `behaviouralScores[${i}].score must be a number` });
        }
      }

      const componentIds = behaviouralScores.map(
        (entry: { behaviouralAssessmentComponentId: string }) => entry.behaviouralAssessmentComponentId.trim()
      );
      const duplicateComponentIds = [
        ...new Set(componentIds.filter((id: string, index: number) => componentIds.indexOf(id) !== index)),
      ];
      if (duplicateComponentIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Duplicate behaviouralAssessmentComponentId in request",
        });
      }

      const result = await studentBehaviouralAssessmentScoreService.upsertBulkForStudent({
        studentId: studentId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        behaviouralScores: behaviouralScores.map(
          (entry: { behaviouralAssessmentComponentId: string; score: string | number }) => ({
            behaviouralAssessmentComponentId: entry.behaviouralAssessmentComponentId.trim(),
            score: entry.score,
          })
        ),
      });

      return res.status(201).json({
        success: true,
        message: "Student behavioural assessment scores saved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to save student behavioural assessment scores");
    }
  },

  createBulk: async (req: Request, res: Response) => {
    try {
      const { behaviouralAssessmentComponentId, classId, sessionId, termId, studentScores } =
        req.body ?? {};

      if (
        !behaviouralAssessmentComponentId ||
        typeof behaviouralAssessmentComponentId !== "string" ||
        !behaviouralAssessmentComponentId.trim()
      ) {
        return res.status(400).json({ success: false, message: "behaviouralAssessmentComponentId is required" });
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
      if (!Array.isArray(studentScores) || studentScores.length === 0) {
        return res.status(400).json({ success: false, message: "studentScores must be a non-empty array" });
      }

      for (let i = 0; i < studentScores.length; i++) {
        const entry = studentScores[i];
        if (!entry || typeof entry !== "object") {
          return res.status(400).json({ success: false, message: `studentScores[${i}] must be an object` });
        }
        const { studentId, score, subclassId } = entry as {
          studentId?: unknown;
          score?: unknown;
          subclassId?: unknown;
        };
        if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
          return res.status(400).json({ success: false, message: `studentScores[${i}].studentId is required` });
        }
        if (subclassId !== undefined && (typeof subclassId !== "string" || !subclassId.trim())) {
          return res.status(400).json({
            success: false,
            message: `studentScores[${i}].subclassId must be a non-empty string`,
          });
        }
        const parsedScore = parseBodyDecimal(score, "score");
        if (parsedScore === "missing") {
          return res.status(400).json({ success: false, message: `studentScores[${i}].score is required` });
        }
        if (parsedScore === "invalid") {
          return res.status(400).json({ success: false, message: `studentScores[${i}].score must be a number` });
        }
      }

      const result = await studentBehaviouralAssessmentScoreService.createMany({
        behaviouralAssessmentComponentId: behaviouralAssessmentComponentId.trim(),
        classId: classId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
        studentScores: studentScores.map(
          (entry: { studentId: string; score: string | number; subclassId?: string }) => ({
            studentId: entry.studentId.trim(),
            score: entry.score,
            ...(entry.subclassId !== undefined ? { subclassId: entry.subclassId.trim() } : {}),
          })
        ),
      });

      return res.status(201).json({
        success: true,
        message: "Student behavioural assessment scores saved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to save student behavioural assessment scores");
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const {
        studentId,
        behaviouralAssessmentComponentId,
        score,
        classId,
        subclassId,
        sessionId,
        termId,
      } = req.body ?? {};

      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (
        !behaviouralAssessmentComponentId ||
        typeof behaviouralAssessmentComponentId !== "string" ||
        !behaviouralAssessmentComponentId.trim()
      ) {
        return res.status(400).json({ success: false, message: "behaviouralAssessmentComponentId is required" });
      }
      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!subclassId || typeof subclassId !== "string" || !subclassId.trim()) {
        return res.status(400).json({ success: false, message: "subclassId is required" });
      }
      if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId || typeof termId !== "string" || !termId.trim()) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }

      const parsedScore = parseBodyDecimal(score, "score");
      if (parsedScore === "missing") {
        return res.status(400).json({ success: false, message: "score is required" });
      }
      if (parsedScore === "invalid") {
        return res.status(400).json({ success: false, message: "score must be a number" });
      }

      const created = await studentBehaviouralAssessmentScoreService.create({
        studentId: studentId.trim(),
        behaviouralAssessmentComponentId: behaviouralAssessmentComponentId.trim(),
        score: parsedScore,
        classId: classId.trim(),
        subclassId: subclassId.trim(),
        sessionId: sessionId.trim(),
        termId: termId.trim(),
      });

      return res.status(201).json({
        success: true,
        message: "Student behavioural assessment score created successfully",
        data: created,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create student behavioural assessment score");
    }
  },

  studentScores: async (req: Request, res: Response) => {
    try {
      const studentId = queryString(req.query, "studentId");
      const classId = queryString(req.query, "classId");
      const sessionId = queryString(req.query, "sessionId");
      const termId = queryString(req.query, "termId");

      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!classId) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }
      if (!termId) {
        return res.status(400).json({ success: false, message: "termId is required" });
      }

      const result = await studentBehaviouralAssessmentScoreService.getStudentBehaviouralScores({
        studentId,
        classId,
        sessionId,
        termId,
      });

      return res.json({
        success: true,
        message: "Student behavioural assessment scores retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student behavioural assessment scores");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await studentBehaviouralAssessmentScoreService.list({
        studentId: queryString(req.query, "studentId"),
        behaviouralAssessmentComponentId: queryString(req.query, "behaviouralAssessmentComponentId"),
        behaviourTemplateId: queryString(req.query, "behaviourTemplateId"),
        classId: queryString(req.query, "classId"),
        subclassId: queryString(req.query, "subclassId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      return res.json({
        success: true,
        message: "Student behavioural assessment scores retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student behavioural assessment scores");
    }
  },

  /**
   * @openapi
   * /api/v1/student-behavioural-assessment-scores/{id}:
   *   get:
   *     summary: Get a student behavioural assessment score by ID
   *     tags: [StudentBehaviouralAssessmentScores]
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
   *         description: Student behavioural assessment score details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a student behavioural assessment score
   *     tags: [StudentBehaviouralAssessmentScores]
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
   *               score:
   *                 type: number
   *               behaviouralAssessmentComponentId:
   *                 type: string
   *               classId:
   *                 type: string
   *               subclassId:
   *                 type: string
   *               sessionId:
   *                 type: string
   *               termId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Student behavioural assessment score updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a student behavioural assessment score
   *     tags: [StudentBehaviouralAssessmentScores]
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
   *         description: Student behavioural assessment score deleted
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await studentBehaviouralAssessmentScoreService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Student behavioural assessment score not found" });
      }

      return res.json({
        success: true,
        message: "Student behavioural assessment score retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve student behavioural assessment score");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        score,
        behaviouralAssessmentComponentId,
        classId,
        subclassId,
        sessionId,
        termId,
      } = req.body ?? {};
      if (
        score === undefined &&
        behaviouralAssessmentComponentId === undefined &&
        classId === undefined &&
        subclassId === undefined &&
        sessionId === undefined &&
        termId === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      if (
        behaviouralAssessmentComponentId !== undefined &&
        (typeof behaviouralAssessmentComponentId !== "string" || !behaviouralAssessmentComponentId.trim())
      ) {
        return res
          .status(400)
          .json({ success: false, message: "behaviouralAssessmentComponentId must be a non-empty string" });
      }
      if (classId !== undefined && (typeof classId !== "string" || !classId.trim())) {
        return res.status(400).json({ success: false, message: "classId must be a non-empty string" });
      }
      if (subclassId !== undefined && (typeof subclassId !== "string" || !subclassId.trim())) {
        return res.status(400).json({ success: false, message: "subclassId must be a non-empty string" });
      }
      if (sessionId !== undefined && (typeof sessionId !== "string" || !sessionId.trim())) {
        return res.status(400).json({ success: false, message: "sessionId must be a non-empty string" });
      }
      if (termId !== undefined && (typeof termId !== "string" || !termId.trim())) {
        return res.status(400).json({ success: false, message: "termId must be a non-empty string" });
      }

      const parsedScore = parseBodyDecimal(score, "score");
      if (score !== undefined && parsedScore === "invalid") {
        return res.status(400).json({ success: false, message: "score must be a number" });
      }

      const updated = await studentBehaviouralAssessmentScoreService.update(id, {
        ...(parsedScore !== "missing" && parsedScore !== "invalid" ? { score: parsedScore } : {}),
        ...(behaviouralAssessmentComponentId !== undefined
          ? { behaviouralAssessmentComponentId: behaviouralAssessmentComponentId.trim() }
          : {}),
        ...(classId !== undefined ? { classId: classId.trim() } : {}),
        ...(subclassId !== undefined ? { subclassId: subclassId.trim() } : {}),
        ...(sessionId !== undefined ? { sessionId: sessionId.trim() } : {}),
        ...(termId !== undefined ? { termId: termId.trim() } : {}),
      });

      return res.json({
        success: true,
        message: "Student behavioural assessment score updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update student behavioural assessment score");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await studentBehaviouralAssessmentScoreService.delete(id);

      return res.json({
        success: true,
        message: "Student behavioural assessment score deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete student behavioural assessment score");
    }
  },
};
