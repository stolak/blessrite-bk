import { Router } from "express";
import { creditBureauScoreController } from "../controllers/creditBureauScoreController";

const router = Router();

router.post("/calculate", creditBureauScoreController.calculate);

export default router;
