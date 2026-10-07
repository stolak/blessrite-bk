import { Router } from "express";
import { gradingTemplateController } from "../controllers/gradingTemplateController";

const router = Router();

router.post("/", gradingTemplateController.create);
router.get("/", gradingTemplateController.list);
router.get("/:id", gradingTemplateController.getById);
router.put("/:id", gradingTemplateController.update);
router.delete("/:id", gradingTemplateController.remove);

export default router;
