import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { inventoryReceiveAcknowledgementController } from "../controllers/inventoryReceiveAcknowledgementController";

const router = Router();

router.use(authenticateJWT);

router.post("/", inventoryReceiveAcknowledgementController.acknowledge);

export default router;
