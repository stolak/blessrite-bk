import { Router } from "express";
import { gradingTemplateItemController } from "../controllers/gradingTemplateItemController";

const router = Router();

router.post("/", gradingTemplateItemController.create);
router.get("/", gradingTemplateItemController.list);
router.get("/:id", gradingTemplateItemController.getById);
router.put("/:id", gradingTemplateItemController.update);
router.delete("/:id", gradingTemplateItemController.remove);

export default router;
