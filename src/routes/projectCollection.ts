import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { projectCollectionController } from "../controllers/projectCollectionController";

const router = Router();

router.use(authenticateJWT);

router.post("/bulk", projectCollectionController.createBulkProjectCollections);
router.put("/bulk", projectCollectionController.updateBulkProjectCollections);
router.delete("/bulk", projectCollectionController.deleteBulkProjectCollections);
router.post("/", projectCollectionController.createProjectCollection);
router.get("/summary", projectCollectionController.getProjectCollectionSummary);
router.get("/", projectCollectionController.listProjectCollections);
router.get("/:id", projectCollectionController.getProjectCollectionById);
router.put("/:id", projectCollectionController.updateProjectCollection);
router.delete("/:id", projectCollectionController.deleteProjectCollection);

export default router;
