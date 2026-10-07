import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { facilityController } from "../controllers/facilityController";

const router = Router();

router.use(authenticateJWT);

router.post("/", facilityController.createFacility);
router.get("/", facilityController.listFacilities);
router.get("/:id", facilityController.getFacilityById);
router.put("/:id", facilityController.updateFacility);
router.delete("/:id", facilityController.deleteFacility);

export default router;
