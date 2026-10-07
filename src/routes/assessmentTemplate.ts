import { Router } from "express";
import { assessmentTemplateController } from "../controllers/assessmentTemplateController";

const router = Router();

router.post("/", assessmentTemplateController.create);
router.get("/", assessmentTemplateController.list);
router.get("/:id", assessmentTemplateController.getById);
router.put("/:id", assessmentTemplateController.update);
router.delete("/:id", assessmentTemplateController.remove);

export default router;
