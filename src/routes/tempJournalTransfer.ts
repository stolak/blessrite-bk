import { Router } from "express";
import { tempJournalTransferController } from "../controllers/tempJournalTransferController";
import { authenticateJWT } from "../middlewares/auth";

const router = Router();
router.use(authenticateJWT);

router.post("/", tempJournalTransferController.create);
router.post("/bulk", tempJournalTransferController.createBulk);
router.post("/reference/:referenceNo/bulk", tempJournalTransferController.appendBulkByReferenceNo);
router.get("/grouped/reference-no", tempJournalTransferController.listGroupedByReferenceNo);
router.delete("/reference/:referenceNo", tempJournalTransferController.deleteByReferenceNo);
router.get("/", tempJournalTransferController.list);
router.get("/:id", tempJournalTransferController.getById);
router.put("/:id", tempJournalTransferController.update);
router.delete("/:id", tempJournalTransferController.delete);

export default router;
