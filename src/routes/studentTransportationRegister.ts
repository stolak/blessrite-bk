import { Router } from "express";
import { studentTransportationRegisterController } from "../controllers/studentTransportationRegisterController";

const router = Router();

router.post("/", studentTransportationRegisterController.create);
router.post("/bulk", studentTransportationRegisterController.createMany);
router.get("/", studentTransportationRegisterController.list);
router.get("/mine/parent", studentTransportationRegisterController.listMine);
router.get("/:id", studentTransportationRegisterController.getById);
router.put("/:id", studentTransportationRegisterController.update);
router.delete("/:id", studentTransportationRegisterController.remove);

export default router;
