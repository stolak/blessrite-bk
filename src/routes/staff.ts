import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { staffController } from "../controllers/staffController";

const router = Router();

router.use(authenticateJWT);

router.post("/", staffController.createStaff);
router.get("/", staffController.listStaff);
router.get("/:id", staffController.getStaffById);
router.put("/:id", staffController.updateStaff);
router.delete("/:id", staffController.deleteStaff);

export default router;

