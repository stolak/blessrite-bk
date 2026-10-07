import { Router } from "express";
import { payrollController } from "../controllers/payrollController";

const router = Router();

router.get("/report", payrollController.report);
router.post("/compute", payrollController.compute);
router.patch("/approval", payrollController.setApproval);
router.patch("/post", payrollController.post);

export default router;
