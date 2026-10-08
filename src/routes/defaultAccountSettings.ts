import { Router } from "express";
import { defaultAccountSettingsController } from "../controllers/defaultAccountSettingsController";

const router = Router();

router.get("/", defaultAccountSettingsController.list);
router.get(
  "/:settingsId/account-chart",
  defaultAccountSettingsController.getAccountChartBySettingsId
);
router.patch("/:settingsId", defaultAccountSettingsController.patch);

export default router;
