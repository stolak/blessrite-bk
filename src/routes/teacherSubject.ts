import { Router } from "express";
import { teacherSubjectController } from "../controllers/teacherSubjectController";

const router = Router();

router.post("/bulk", teacherSubjectController.createBulk);
router.post("/", teacherSubjectController.create);
router.get("/me", teacherSubjectController.listMine);
router.get("/", teacherSubjectController.list);
router.get("/:id", teacherSubjectController.getById);
router.put("/:id", teacherSubjectController.update);
router.delete("/:id", teacherSubjectController.remove);

export default router;
