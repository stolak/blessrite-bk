import { Router } from "express";
import { accountChartController } from "../controllers/accountChartController";

const router = Router();

router.post("/", accountChartController.create);
router.get("/", accountChartController.list);
router.get("/:id", accountChartController.getById);
router.put("/:id", accountChartController.update);
router.delete("/:id", accountChartController.remove);

export default router;
