import { Request, Response } from "express";
import { assessmentRemarksService } from "../services/assessmentRemarksService";
import { handleAssessmentError, requireRouteId } from "../utils/assessmentController";
import { isStringOrNullOrUndefined } from "../utils/request";

function queryString(query: Request["query"], key: string): string | undefined {
  const raw = query[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * @openapi
 * /api/v1/assessment-remarks:
 *   post:
 *     summary: Create or update assessment remarks for a student
 *     tags: [AssessmentRemarks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, classId]
 *             properties:
 *               studentId:
 *                 type: string
 *               classId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *                 nullable: true
 *               termId:
 *                 type: string
 *                 nullable: true
 *               teacherRemark:
 *                 type: string
 *                 nullable: true
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
 *         description: Assessment remarks created
 *       200:
 *         description: Assessment remarks updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate remarks for student/class/session
 *       500:
 *         description: Server error
 *   get:
 *     summary: List assessment remarks
 *     tags: [AssessmentRemarks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
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
 *         description: Assessment remarks list
 *       500:
 *         description: Server error
 */
export const assessmentRemarksController = {
  create: async (req: Request, res: Response) => {
    try {
      const {
        studentId,
        classId,
        sessionId,
        termId,
        teacherRemark,
        parentRemark,
        principalRemark,
        headTeacherRemark,
        classTeacherRemark,
        otherRemark,
      } = req.body ?? {};

      if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (!classId || typeof classId !== "string" || !classId.trim()) {
        return res.status(400).json({ success: false, message: "classId is required" });
      }
      for (const [field, value] of [
        ["sessionId", sessionId],
        ["termId", termId],
        ["teacherRemark", teacherRemark],
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

      const { assessmentRemarks, created } = await assessmentRemarksService.create({
        studentId: studentId.trim(),
        classId: classId.trim(),
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(termId !== undefined ? { termId } : {}),
        ...(teacherRemark !== undefined ? { teacherRemark } : {}),
        ...(parentRemark !== undefined ? { parentRemark } : {}),
        ...(principalRemark !== undefined ? { principalRemark } : {}),
        ...(headTeacherRemark !== undefined ? { headTeacherRemark } : {}),
        ...(classTeacherRemark !== undefined ? { classTeacherRemark } : {}),
        ...(otherRemark !== undefined ? { otherRemark } : {}),
      });

      return res.status(created ? 201 : 200).json({
        success: true,
        message: created
          ? "Assessment remarks created successfully"
          : "Assessment remarks updated successfully",
        data: assessmentRemarks,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to create assessment remarks");
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const result = await assessmentRemarksService.list({
        studentId: queryString(req.query, "studentId"),
        classId: queryString(req.query, "classId"),
        sessionId: queryString(req.query, "sessionId"),
        termId: queryString(req.query, "termId"),
      });

      return res.json({
        success: true,
        message: "Assessment remarks retrieved successfully",
        data: result,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment remarks");
    }
  },

  /**
   * @openapi
   * /api/v1/assessment-remarks/{id}:
   *   get:
   *     summary: Get assessment remarks by ID
   *     tags: [AssessmentRemarks]
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
   *         description: Assessment remarks details
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update assessment remarks
   *     tags: [AssessmentRemarks]
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
   *               sessionId:
   *                 type: string
   *                 nullable: true
   *               termId:
   *                 type: string
   *                 nullable: true
   *               teacherRemark:
   *                 type: string
   *                 nullable: true
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
   *         description: Assessment remarks updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Not found
   *       409:
   *         description: Conflict
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete assessment remarks
   *     tags: [AssessmentRemarks]
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
   *         description: Assessment remarks deleted
   *       404:
   *         description: Not found
   *       500:
   *         description: Server error
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const row = await assessmentRemarksService.getById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: "Assessment remarks not found" });
      }

      return res.json({
        success: true,
        message: "Assessment remarks retrieved successfully",
        data: row,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to retrieve assessment remarks");
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const {
        sessionId,
        termId,
        teacherRemark,
        parentRemark,
        principalRemark,
        headTeacherRemark,
        classTeacherRemark,
        otherRemark,
      } = req.body ?? {};

      if (
        sessionId === undefined &&
        termId === undefined &&
        teacherRemark === undefined &&
        parentRemark === undefined &&
        principalRemark === undefined &&
        headTeacherRemark === undefined &&
        classTeacherRemark === undefined &&
        otherRemark === undefined
      ) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }

      for (const [field, value] of [
        ["sessionId", sessionId],
        ["termId", termId],
        ["teacherRemark", teacherRemark],
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

      const updated = await assessmentRemarksService.update(id, {
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(termId !== undefined ? { termId } : {}),
        ...(teacherRemark !== undefined ? { teacherRemark } : {}),
        ...(parentRemark !== undefined ? { parentRemark } : {}),
        ...(principalRemark !== undefined ? { principalRemark } : {}),
        ...(headTeacherRemark !== undefined ? { headTeacherRemark } : {}),
        ...(classTeacherRemark !== undefined ? { classTeacherRemark } : {}),
        ...(otherRemark !== undefined ? { otherRemark } : {}),
      });

      return res.json({
        success: true,
        message: "Assessment remarks updated successfully",
        data: updated,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to update assessment remarks");
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const id = requireRouteId(req, res);
      if (!id) return;

      const deleted = await assessmentRemarksService.delete(id);

      return res.json({
        success: true,
        message: "Assessment remarks deleted successfully",
        data: deleted,
      });
    } catch (error: unknown) {
      return handleAssessmentError(res, error, "Failed to delete assessment remarks");
    }
  },
};
