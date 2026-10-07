import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { studentCollectionController } from "../controllers/studentCollectionController";

const router = Router();

router.use(authenticateJWT);

router.post("/bulk", studentCollectionController.createBulkStudentCollections);
router.put("/bulk", studentCollectionController.updateBulkStudentCollections);
router.delete("/bulk", studentCollectionController.deleteBulkStudentCollections);
router.post("/report/items-received", studentCollectionController.getStudentItemsReceivedReport);
router.post("/", studentCollectionController.createStudentCollection);
router.get("/summary", studentCollectionController.getStudentCollectionSummary);
router.get("/", studentCollectionController.listStudentCollections);
router.get("/:id", studentCollectionController.getStudentCollectionById);
router.put("/:id", studentCollectionController.updateStudentCollection);
router.delete("/:id", studentCollectionController.deleteStudentCollection);

export default router;

