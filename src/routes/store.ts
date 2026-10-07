import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { storeController } from "../controllers/storeController";

const router = Router();

router.use(authenticateJWT);

router.post("/", storeController.createStore);
router.get("/", storeController.listStores);
router.get("/me", storeController.listMyStores);
router.get("/:id/users", storeController.listStoreUsers);
router.post("/:id/users", storeController.addUserToStore);
router.delete("/:id/users/:userId", storeController.removeUserFromStore);
router.get("/:id", storeController.getStoreById);
router.put("/:id", storeController.updateStore);
router.delete("/:id", storeController.deleteStore);

export default router;
