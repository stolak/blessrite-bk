import { Router } from "express";
import { salaryChartController } from "../controllers/salaryChartController";

const router = Router();

router.post("/upsert", salaryChartController.upsert);
router.get("/", salaryChartController.list);
router.get("/:id", salaryChartController.getById);

export default router;
