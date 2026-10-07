import { Router } from "express";
import { staffBankDetailsController } from "../controllers/staffBankDetailsController";

const router = Router();

router.post("/bulk", staffBankDetailsController.createBulk);
router.post("/", staffBankDetailsController.create);
router.get("/", staffBankDetailsController.list);
router.get("/:id", staffBankDetailsController.getById);
router.put("/:id", staffBankDetailsController.update);
router.delete("/:id", staffBankDetailsController.remove);

export default router;
