import { Router } from "express";
import { defaultBillingPeriodController } from "../controllers/defaultBillingPeriodController";

const router = Router();

router.get("/", defaultBillingPeriodController.getDefaultBillingPeriod);
router.put("/", defaultBillingPeriodController.upsertDefaultBillingPeriod);

export default router;
