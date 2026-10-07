import { Router } from "express";
import { activePeriodController } from "../controllers/activePeriodController";

const router = Router();

router.get("/", activePeriodController.getActivePeriod);
router.put("/", activePeriodController.upsertActivePeriod);

export default router;

