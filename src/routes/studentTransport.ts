import { Router } from "express";
import { studentTransportController } from "../controllers/studentTransportController";

const router = Router();

router.post("/upsert", studentTransportController.upsert);
router.post("/", studentTransportController.create);
router.get("/", studentTransportController.list);
router.get("/by-student/:studentId", studentTransportController.getByStudentId);
router.get("/:id", studentTransportController.getById);
router.put("/:id", studentTransportController.update);
router.delete("/:id", studentTransportController.remove);

export default router;
