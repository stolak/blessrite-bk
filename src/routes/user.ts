import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { userController } from "../controllers/userController";
import { userStoreController } from "../controllers/userStoreController";

const router = Router();

router.use(authenticateJWT);

router.get("/", userController.listUsers);
router.get("/:userId", userController.getUserById);
router.get("/:userId/privileges", userController.getUserPrivileges);
router.get("/:userId/menus", userController.getUserMenus);
router.post("/:userId/privileges", userController.addPrivilegesToUser);
router.delete("/:userId/privileges/:privilegeId", userController.removePrivilegeFromUser);
router.post("/:userId/roles", userController.addAppRoleToUser);
router.delete("/:userId/roles/:roleId", userController.removeAppRoleFromUser);
router.get("/:userId/stores", userStoreController.listStoresForUser);
router.get("/:userId/accessible-stores", userStoreController.listAccessibleStoresForUser);

export default router;
