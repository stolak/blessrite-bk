import { Router } from "express";
import { behaviouralAssessmentTemplateController } from "../controllers/behaviouralAssessmentTemplateController";

const router = Router();

router.post("/", behaviouralAssessmentTemplateController.create);
router.get("/", behaviouralAssessmentTemplateController.list);
router.get("/:id", behaviouralAssessmentTemplateController.getById);
router.put("/:id", behaviouralAssessmentTemplateController.update);
router.delete("/:id", behaviouralAssessmentTemplateController.remove);

export default router;
