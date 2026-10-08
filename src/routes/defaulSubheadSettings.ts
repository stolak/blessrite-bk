import { Router } from "express";
import { defaulSubheadSettingsController } from "../controllers/defaulSubheadSettingsController";

const router = Router();

router.get("/", defaulSubheadSettingsController.list);
router.get(
  "/:settingsId/account-charts",
  defaulSubheadSettingsController.getAccountChartsBySettingsId
);
router.get("/:settingsId", defaulSubheadSettingsController.getBySettingsId);
router.patch("/:settingsId", defaulSubheadSettingsController.patch);

export default router;
