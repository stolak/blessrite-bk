import { Router } from "express";
import { cashierController } from "../controllers/cashierController";

const router = Router();

router.post("/", cashierController.createCashier);
router.get("/", cashierController.listCashiers);
router.get("/:id", cashierController.getCashierById);
router.put("/:id", cashierController.updateCashier);
router.delete("/:id", cashierController.deleteCashier);

export default router;
