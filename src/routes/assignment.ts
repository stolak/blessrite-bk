import { Router } from "express";
import { assignmentController } from "../controllers/assignmentController";

const router = Router();

router.post("/", assignmentController.create);
router.get("/", assignmentController.list);
router.post("/:id/attachments", assignmentController.addAttachment);
router.delete("/:id/attachments/:attachmentId", assignmentController.removeAttachment);
router.get("/:id", assignmentController.getById);
router.put("/:id", assignmentController.update);
router.delete("/:id", assignmentController.remove);

export default router;
