import { Router } from "express";
import { uomController } from "../controllers/uomController";

const router = Router();

router.post("/", uomController.createUom);
router.get("/", uomController.listUoms);
router.get("/:id", uomController.getUomById);
router.put("/:id", uomController.updateUom);
router.delete("/:id", uomController.deleteUom);

export default router;

