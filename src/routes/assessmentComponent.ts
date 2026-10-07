import { Router } from "express";
import { assessmentComponentController } from "../controllers/assessmentComponentController";

const router = Router();

router.post("/", assessmentComponentController.create);
router.get("/", assessmentComponentController.list);
router.get("/:id", assessmentComponentController.getById);
router.put("/:id", assessmentComponentController.update);
router.delete("/:id", assessmentComponentController.remove);

export default router;
