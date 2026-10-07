import { Router } from "express";
import { merchantRiskScoreController } from "../controllers/merchantRiskScoreController";

const router = Router();

router.post("/calculate", merchantRiskScoreController.calculate);

export default router;
