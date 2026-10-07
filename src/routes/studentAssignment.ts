import { Router } from "express";
import { studentAssignmentController } from "../controllers/studentAssignmentController";

const router = Router();

router.post("/", studentAssignmentController.create);
router.get("/me/untreated", studentAssignmentController.listMyUntreated);
router.get("/me", studentAssignmentController.listMy);
router.get("/untreated", studentAssignmentController.listUntreated);
router.get("/", studentAssignmentController.list);
router.post("/:id/attachments", studentAssignmentController.addAttachment);
router.delete("/:id/attachments/:attachmentId", studentAssignmentController.removeAttachment);
router.get("/:id", studentAssignmentController.getById);
router.put("/:id", studentAssignmentController.update);
router.delete("/:id", studentAssignmentController.remove);

export default router;
