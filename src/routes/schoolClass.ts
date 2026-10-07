import { Router } from "express";
import { schoolClassController } from "../controllers/schoolClassController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

// All school class endpoints must be authenticated (createdById is required by schema)
router.use(authenticateJWT);

router.post("/", schoolClassController.createSchoolClass);
router.get("/", schoolClassController.listSchoolClasses);
router.get("/:id", schoolClassController.getSchoolClassById);
router.put("/:id", schoolClassController.updateSchoolClass);
router.delete("/:id", schoolClassController.deleteSchoolClass);

export default router;

