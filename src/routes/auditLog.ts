import { Router } from "express";
import { auditLogController } from "../controllers/auditLogController";

const router = Router();

router.get("/me", auditLogController.listMyAuditLogs);
router.get("/", auditLogController.listAuditLogs);

export default router;
