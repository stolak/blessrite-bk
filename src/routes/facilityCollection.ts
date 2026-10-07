import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { facilityCollectionController } from "../controllers/facilityCollectionController";

const router = Router();

router.use(authenticateJWT);

router.post("/bulk", facilityCollectionController.createBulkFacilityCollections);
router.put("/bulk", facilityCollectionController.updateBulkFacilityCollections);
router.delete("/bulk", facilityCollectionController.deleteBulkFacilityCollections);
router.post("/", facilityCollectionController.createFacilityCollection);
router.get("/summary", facilityCollectionController.getFacilityCollectionSummary);
router.get("/", facilityCollectionController.listFacilityCollections);
router.get("/:id", facilityCollectionController.getFacilityCollectionById);
router.put("/:id", facilityCollectionController.updateFacilityCollection);
router.delete("/:id", facilityCollectionController.deleteFacilityCollection);

export default router;
