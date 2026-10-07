import { Router } from "express";
import { vehicleRouteController } from "../controllers/vehicleRouteController";

const router = Router();

router.post("/bulk", vehicleRouteController.createBulk);
router.post("/", vehicleRouteController.create);
router.get("/", vehicleRouteController.list);
router.get("/:id", vehicleRouteController.getById);
router.delete("/:id", vehicleRouteController.remove);

export default router;
