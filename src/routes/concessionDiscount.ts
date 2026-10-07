import { Router } from "express";
import { concessionDiscountController } from "../controllers/concessionDiscountController";

const router = Router();

router.post("/", concessionDiscountController.createConcessionDiscount);
router.get("/", concessionDiscountController.listConcessionDiscounts);
router.get("/:id", concessionDiscountController.getConcessionDiscountById);
router.put("/:id", concessionDiscountController.updateConcessionDiscount);
router.delete("/:id", concessionDiscountController.deleteConcessionDiscount);

export default router;
