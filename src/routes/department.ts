import { Router } from "express";
import { departmentController } from "../controllers/departmentController";

const router = Router();

router.post("/", departmentController.create);
router.get("/", departmentController.list);
router.get("/:id", departmentController.getById);
router.put("/:id", departmentController.update);
router.delete("/:id", departmentController.remove);

export default router;
