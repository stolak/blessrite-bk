import { Router } from "express";
import { inventoryItemController } from "../controllers/inventoryItemController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

// All inventory item endpoints must be authenticated
router.use(authenticateJWT);

router.post("/", inventoryItemController.createInventoryItem);
router.get("/", inventoryItemController.listInventoryItems);
router.get("/transaction-log", inventoryItemController.getInventoryItemTransactionLog);
router.get("/balances", inventoryItemController.getItemBalancesGrouped);
router.post("/balance-matrix", inventoryItemController.getInventoryBalanceMatrix);
router.get("/:id", inventoryItemController.getInventoryItemById);
router.put("/:id", inventoryItemController.updateInventoryItem);
router.delete("/:id", inventoryItemController.deleteInventoryItem);

export default router;

