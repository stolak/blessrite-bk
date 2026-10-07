import { Router } from "express";
import { openBankingScoreController } from "../controllers/openBankingScoreController";

const router = Router();

router.post("/calculate", openBankingScoreController.calculate);

export default router;
