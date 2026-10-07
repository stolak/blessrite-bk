import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { userStoreController } from "../controllers/userStoreController";

const router = Router();

router.use(authenticateJWT);

router.post("/", userStoreController.grantAccess);
router.get("/", userStoreController.listAssignments);

router.get("/users/:userId/stores", userStoreController.listStoresForUser);
router.get("/users/:userId/accessible-stores", userStoreController.listAccessibleStoresForUser);
router.get("/stores/:storeId/users", userStoreController.listUsersForStore);

router.get("/:userId/:storeId", userStoreController.getAssignment);
router.delete("/:userId/:storeId", userStoreController.revokeAccess);

export default router;
