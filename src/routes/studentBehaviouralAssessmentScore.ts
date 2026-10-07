import { Router } from "express";
import { studentBehaviouralAssessmentScoreController } from "../controllers/studentBehaviouralAssessmentScoreController";

const router = Router();

router.post("/bulk/student", studentBehaviouralAssessmentScoreController.upsertBulkForStudent);
router.post("/bulk", studentBehaviouralAssessmentScoreController.createBulk);
router.post("/", studentBehaviouralAssessmentScoreController.create);
router.get("/student-scores", studentBehaviouralAssessmentScoreController.studentScores);
router.get("/", studentBehaviouralAssessmentScoreController.list);
router.get("/:id", studentBehaviouralAssessmentScoreController.getById);
router.put("/:id", studentBehaviouralAssessmentScoreController.update);
router.delete("/:id", studentBehaviouralAssessmentScoreController.remove);

export default router;
