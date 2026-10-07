import { Router } from "express";
import { bustopController } from "../controllers/bustopController";

const router = Router();

router.post("/", bustopController.create);
router.get("/", bustopController.list);
router.get("/:id", bustopController.getById);
router.put("/:id", bustopController.update);
router.delete("/:id", bustopController.remove);

export default router;
