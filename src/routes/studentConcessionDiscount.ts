import { Router } from "express";
import { studentConcessionDiscountController } from "../controllers/studentConcessionDiscountController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();
router.use(authenticateJWT);

router.post("/", studentConcessionDiscountController.create);
router.post("/bulk", studentConcessionDiscountController.createBulk);
router.patch("/status/bulk", studentConcessionDiscountController.updateStatusBulk);
router.patch("/post/bulk", studentConcessionDiscountController.postBulk);
router.get("/", studentConcessionDiscountController.list);
router.get("/:id", studentConcessionDiscountController.getById);
router.put("/:id", studentConcessionDiscountController.update);
router.delete("/:id", studentConcessionDiscountController.delete);

export default router;
