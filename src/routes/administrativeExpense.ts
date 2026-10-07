import { Router } from "express";
import { administrativeExpenseController } from "../controllers/administrativeExpenseController";

const router = Router();

router.post("/", administrativeExpenseController.create);
router.get("/", administrativeExpenseController.list);
router.get("/:id", administrativeExpenseController.getById);
router.put("/:id", administrativeExpenseController.update);
router.delete("/:id", administrativeExpenseController.remove);

export default router;
