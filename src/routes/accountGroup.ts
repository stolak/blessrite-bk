import { Router } from "express";
import { accountGroupController } from "../controllers/accountGroupController";

const router = Router();

router.get("/", accountGroupController.getAll);
router.get("/:id", accountGroupController.getById);

export default router;
