import { Router } from "express";
import { menuController } from "../controllers/menuController";

const router = Router();

router.post("/", menuController.createMenu);
router.get("/", menuController.listMenus);
router.get("/:id/children", menuController.listMenuChildren);
router.post("/:id/children", menuController.createMenuChild);
router.get("/:id/children/:childId", menuController.getMenuChildById);
router.put("/:id/children/:childId", menuController.updateMenuChild);
router.delete("/:id/children/:childId", menuController.deleteMenuChild);
router.get("/:id", menuController.getMenuById);
router.put("/:id", menuController.updateMenu);
router.delete("/:id", menuController.deleteMenu);

export default router;
