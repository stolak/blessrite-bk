import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { projectController } from "../controllers/projectController";

const router = Router();

router.use(authenticateJWT);

router.post("/", projectController.createProject);
router.get("/", projectController.listProjects);
router.get("/:id", projectController.getProjectById);
router.put("/:id", projectController.updateProject);
router.delete("/:id", projectController.deleteProject);

export default router;
