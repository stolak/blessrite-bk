import { Router } from "express";
import { studentAssessmentScoreController } from "../controllers/studentAssessmentScoreController";

const router = Router();

router.post("/bulk", studentAssessmentScoreController.createBulk);
router.post("/", studentAssessmentScoreController.create);
router.get("/student-result", studentAssessmentScoreController.studentResult);
router.get(
  "/students/:studentId/result-periods",
  studentAssessmentScoreController.listStudentResultPeriods
);
router.get("/student-report", studentAssessmentScoreController.studentAssessmentReport);
router.get("/student-score-report", studentAssessmentScoreController.studentSubjectScoreReport);
router.get("/student-scores", studentAssessmentScoreController.studentSubjectScores);
router.get("/score-sheet", studentAssessmentScoreController.scoreSheet);
router.get("/broadsheet", studentAssessmentScoreController.broadsheet);
router.get("/", studentAssessmentScoreController.list);
router.get("/:id", studentAssessmentScoreController.getById);
router.put("/:id", studentAssessmentScoreController.update);
router.delete("/:id", studentAssessmentScoreController.remove);

export default router;
