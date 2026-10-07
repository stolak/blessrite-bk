import { Router } from "express";
import { classAssessmentTemplateController } from "../controllers/classAssessmentTemplateController";

const router = Router();

router.post("/", classAssessmentTemplateController.create);
router.get("/resolve", classAssessmentTemplateController.resolve);
router.get("/", classAssessmentTemplateController.list);
router.get("/:id", classAssessmentTemplateController.getById);
router.put("/:id", classAssessmentTemplateController.update);
router.delete("/:id", classAssessmentTemplateController.remove);

export default router;
