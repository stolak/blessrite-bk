import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { staffCollectionController } from "../controllers/staffCollectionController";

const router = Router();

router.use(authenticateJWT);

router.post("/bulk", staffCollectionController.createBulkStaffCollections);
router.put("/bulk", staffCollectionController.updateBulkStaffCollections);
router.delete("/bulk", staffCollectionController.deleteBulkStaffCollections);
router.post("/", staffCollectionController.createStaffCollection);
router.get("/summary", staffCollectionController.getStaffCollectionSummary);
router.get("/", staffCollectionController.listStaffCollections);
router.get("/:id", staffCollectionController.getStaffCollectionById);
router.put("/:id", staffCollectionController.updateStaffCollection);
router.delete("/:id", staffCollectionController.deleteStaffCollection);

export default router;

