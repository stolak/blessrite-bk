import { Router } from "express";
import { activePayrollPeriodController } from "../controllers/activePayrollPeriodController";

const router = Router();

router.get("/", activePayrollPeriodController.getActivePayrollPeriod);
router.put("/", activePayrollPeriodController.upsertActivePayrollPeriod);

export default router;
