import { Router } from "express";
import { classDefaultBillingController } from "../controllers/classDefaultBillingController";

const router = Router();

router.post("/", classDefaultBillingController.create);
router.post("/bulk", classDefaultBillingController.createBulk);
router.post("/apply-to-students", classDefaultBillingController.applyToStudents);
router.get("/", classDefaultBillingController.list);
router.get("/:id", classDefaultBillingController.getById);
router.put("/:id", classDefaultBillingController.update);
router.delete("/:id", classDefaultBillingController.delete);

export default router;
