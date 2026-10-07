import { Router } from "express";
import { subClassController } from "../controllers/subClassController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

router.use(authenticateJWT);

router.post("/", subClassController.createSubClass);
router.get("/", subClassController.listSubClasses);
router.get("/:id", subClassController.getSubClassById);
router.put("/:id", subClassController.updateSubClass);
router.delete("/:id", subClassController.deleteSubClass);

export default router;

