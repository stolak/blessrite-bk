import { Router } from "express";
import { attendanceRecordController } from "../controllers/attendanceRecordController";

const router = Router();

router.post("/bulk", attendanceRecordController.createBulk);
router.post("/", attendanceRecordController.create);
router.get("/reports/by-date", attendanceRecordController.reportByDate);
router.get("/reports/class-date", attendanceRecordController.reportByClassDate);
router.get("/reports/student-summary", attendanceRecordController.reportByStudentSummary);
router.get("/reports/student", attendanceRecordController.reportByStudent);
router.get("/", attendanceRecordController.list);
router.get("/:id", attendanceRecordController.getById);
router.put("/:id", attendanceRecordController.update);
router.delete("/:id", attendanceRecordController.remove);

export default router;
