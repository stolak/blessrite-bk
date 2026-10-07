import { Router } from "express";
import { administrativeExpenseComponentController } from "../controllers/administrativeExpenseComponentController";

const router = Router();

router.post("/", administrativeExpenseComponentController.create);
router.get("/", administrativeExpenseComponentController.list);
router.get("/:id", administrativeExpenseComponentController.getById);
router.put("/:id", administrativeExpenseComponentController.update);
router.delete("/:id", administrativeExpenseComponentController.remove);

export default router;
