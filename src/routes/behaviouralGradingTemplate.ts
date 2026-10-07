import { Router } from "express";
import { behaviouralGradingTemplateController } from "../controllers/behaviouralGradingTemplateController";

const router = Router();

router.post("/", behaviouralGradingTemplateController.create);
router.get("/", behaviouralGradingTemplateController.list);
router.get("/:id", behaviouralGradingTemplateController.getById);
router.put("/:id", behaviouralGradingTemplateController.update);
router.delete("/:id", behaviouralGradingTemplateController.remove);

export default router;
