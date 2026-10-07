import { Router } from "express";
import { vehicleTripController } from "../controllers/vehicleTripController";

const router = Router();

router.post("/", vehicleTripController.create);
router.get("/", vehicleTripController.list);
router.get("/mine", vehicleTripController.listMine);
router.get("/:id/eligible-students", vehicleTripController.listEligibleStudents);
router.post("/:id/support-staff", vehicleTripController.addSupportStaff);
router.delete("/:id/support-staff/:staffId", vehicleTripController.removeSupportStaff);
router.get("/:id", vehicleTripController.getById);
router.put("/:id", vehicleTripController.update);
router.delete("/:id", vehicleTripController.remove);

export default router;
