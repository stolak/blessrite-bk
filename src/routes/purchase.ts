import { Router } from "express";
import { purchaseController } from "../controllers/purchaseController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

router.use(authenticateJWT);

router.get("/grouped", purchaseController.listGroupedPurchases);
router.post("/bulk", purchaseController.createBulkPurchases);
router.post("/", purchaseController.createPurchase);
router.get("/", purchaseController.listPurchases);
router.get("/:id", purchaseController.getPurchaseById);
router.put("/:id", purchaseController.updatePurchase);
router.delete("/:id", purchaseController.deletePurchase);

export default router;

