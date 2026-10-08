import { Router } from "express";
import { supplierController } from "../controllers/supplierController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

// All supplier endpoints must be authenticated
router.use(authenticateJWT);

router.post("/", supplierController.createSupplier);
router.get("/", supplierController.listSuppliers);
router.get("/:id", supplierController.getSupplierById);
router.put("/:id", supplierController.updateSupplier);
router.delete("/:id", supplierController.deleteSupplier);

export default router;

