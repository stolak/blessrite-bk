import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { storeTransferController } from "../controllers/storeTransferController";

const router = Router();

router.use(authenticateJWT);

router.get("/", storeTransferController.listStoreTransfers);
router.post("/", storeTransferController.transfer);

export default router;
