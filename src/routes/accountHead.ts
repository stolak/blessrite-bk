import { Router } from "express";
import { accountHeadController } from "../controllers/accountHeadController";

const router = Router();

router.get("/", accountHeadController.getAll);
router.get("/:id", accountHeadController.getById);

export default router;
