import { Router } from "express";
import { accountSubheadController } from "../controllers/accountSubheadController";

const router = Router();

router.post("/", accountSubheadController.create);
router.get("/", accountSubheadController.list);
router.get("/:id", accountSubheadController.getById);
router.put("/:id", accountSubheadController.update);
router.delete("/:id", accountSubheadController.remove);

export default router;
