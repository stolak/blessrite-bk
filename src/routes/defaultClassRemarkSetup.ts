import { Router } from "express";
import { defaultClassRemarkSetupController } from "../controllers/defaultClassRemarkSetupController";

const router = Router();

router.post("/", defaultClassRemarkSetupController.create);
router.get("/", defaultClassRemarkSetupController.list);
router.get("/:id", defaultClassRemarkSetupController.getById);
router.put("/:id", defaultClassRemarkSetupController.update);
router.delete("/:id", defaultClassRemarkSetupController.remove);

export default router;
