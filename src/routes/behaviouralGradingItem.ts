import { Router } from "express";
import { behaviouralGradingItemController } from "../controllers/behaviouralGradingItemController";

const router = Router();

router.post("/", behaviouralGradingItemController.create);
router.get("/", behaviouralGradingItemController.list);
router.get("/:id", behaviouralGradingItemController.getById);
router.put("/:id", behaviouralGradingItemController.update);
router.delete("/:id", behaviouralGradingItemController.remove);

export default router;
