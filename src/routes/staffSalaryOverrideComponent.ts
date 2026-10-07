import { Router } from "express";
import { staffSalaryOverrideComponentController } from "../controllers/staffSalaryOverrideComponentController";

const router = Router();

router.post("/", staffSalaryOverrideComponentController.create);
router.get("/", staffSalaryOverrideComponentController.list);
router.get("/:id", staffSalaryOverrideComponentController.getById);
router.put("/:id", staffSalaryOverrideComponentController.update);
router.delete("/:id", staffSalaryOverrideComponentController.remove);

export default router;

