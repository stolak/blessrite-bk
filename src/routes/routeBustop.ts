import { Router } from "express";
import { routeBustopController } from "../controllers/routeBustopController";

const router = Router();

router.post("/bulk", routeBustopController.createBulk);
router.post("/", routeBustopController.create);
router.get("/", routeBustopController.list);
router.get("/:id", routeBustopController.getById);
router.put("/:id", routeBustopController.update);
router.delete("/:id", routeBustopController.remove);

export default router;
