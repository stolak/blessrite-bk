import { Router } from "express";
import { sessionController } from "../controllers/sessionController";

const router = Router();

router.post("/", sessionController.createSession);
router.get("/", sessionController.listSessions);
router.get("/:id", sessionController.getSessionById);
router.put("/:id", sessionController.updateSession);
router.delete("/:id", sessionController.deleteSession);

export default router;

