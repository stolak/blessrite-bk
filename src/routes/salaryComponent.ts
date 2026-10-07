import { Router } from "express";
import { salaryComponentController } from "../controllers/salaryComponentController";

const router = Router();

router.post("/", salaryComponentController.create);
router.get("/", salaryComponentController.list);
router.get("/:id", salaryComponentController.getById);
router.put("/:id", salaryComponentController.update);
router.delete("/:id", salaryComponentController.remove);

export default router;
