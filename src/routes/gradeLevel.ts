import { Router } from "express";
import { gradeLevelController } from "../controllers/gradeLevelController";

const router = Router();

router.post("/", gradeLevelController.create);
router.get("/", gradeLevelController.list);
router.get("/:id", gradeLevelController.getById);
router.put("/:id", gradeLevelController.update);
router.delete("/:id", gradeLevelController.remove);

export default router;
