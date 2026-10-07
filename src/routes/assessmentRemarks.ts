import { Router } from "express";
import { assessmentRemarksController } from "../controllers/assessmentRemarksController";

const router = Router();

router.post("/", assessmentRemarksController.create);
router.get("/", assessmentRemarksController.list);
router.get("/:id", assessmentRemarksController.getById);
router.put("/:id", assessmentRemarksController.update);
router.delete("/:id", assessmentRemarksController.remove);

export default router;
