import { Router } from "express";
import { studentController } from "../controllers/studentController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();

router.use(authenticateJWT);

router.post("/", studentController.createStudent);
router.get("/me/guardian", studentController.listGuardianStudents);
router.get("/", studentController.listStudents);
router.patch("/class/bulk", studentController.bulkUpdateStudentClassAndSubClassAndStatus);
router.get("/:id", studentController.getStudentById);
router.put("/:id", studentController.updateStudent);
router.delete("/:id", studentController.deleteStudent);

export default router;
