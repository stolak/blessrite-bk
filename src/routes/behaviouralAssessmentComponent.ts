import { Router } from "express";
import { behaviouralAssessmentComponentController } from "../controllers/behaviouralAssessmentComponentController";

const router = Router();

router.post("/", behaviouralAssessmentComponentController.create);
router.get("/", behaviouralAssessmentComponentController.list);
router.get("/:id", behaviouralAssessmentComponentController.getById);
router.put("/:id", behaviouralAssessmentComponentController.update);
router.delete("/:id", behaviouralAssessmentComponentController.remove);

export default router;
