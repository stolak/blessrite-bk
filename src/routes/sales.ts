import { Router } from "express";
import { salesController } from "../controllers/salesController";

const router = Router();

router.post("/bulk", salesController.createBulkSales);
router.get("/bulk", salesController.listGroupedSales);
router.get("/", salesController.listSales);
router.get("/:id", salesController.getSaleById);

export default router;
