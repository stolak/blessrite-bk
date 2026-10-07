import { Router } from "express";
import { classSubjectController } from "../controllers/classSubjectController";

const router = Router();

router.post("/bulk", classSubjectController.createBulk);
router.post("/", classSubjectController.create);
router.get("/", classSubjectController.list);
router.get("/:id", classSubjectController.getById);
router.put("/:id", classSubjectController.update);
router.delete("/:id", classSubjectController.remove);

export default router;
