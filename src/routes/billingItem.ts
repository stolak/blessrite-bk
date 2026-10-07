import { Router } from "express";
import { billingItemController } from "../controllers/billingItemController";

const router = Router();

router.post("/", billingItemController.createBillingItem);
router.get("/", billingItemController.listBillingItems);
router.get("/categories", billingItemController.listBillingItemCategories);
router.get("/:id", billingItemController.getBillingItemById);
router.put("/:id", billingItemController.updateBillingItem);
router.delete("/:id", billingItemController.deleteBillingItem);

export default router;
