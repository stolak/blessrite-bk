import { Router } from "express";
import { vehicleController } from "../controllers/vehicleController";

const router = Router();

router.post("/", vehicleController.create);
router.get("/", vehicleController.list);
router.get("/mine", vehicleController.listMine);
router.get("/:id", vehicleController.getById);
router.put("/:id", vehicleController.update);
router.delete("/:id", vehicleController.remove);

export default router;
