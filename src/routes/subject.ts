import { Router } from "express";
import { subjectController } from "../controllers/subjectController";

const router = Router();

router.post("/", subjectController.create);
router.get("/", subjectController.list);
router.get("/:id", subjectController.getById);
router.put("/:id", subjectController.update);
router.delete("/:id", subjectController.remove);

export default router;
