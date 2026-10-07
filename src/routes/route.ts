import { Router } from "express";
import { routeController } from "../controllers/routeController";

const router = Router();

router.post("/", routeController.create);
router.get("/", routeController.list);
router.get("/:id", routeController.getById);
router.put("/:id", routeController.update);
router.delete("/:id", routeController.remove);

export default router;
