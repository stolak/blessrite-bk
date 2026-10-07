import { Router } from "express";
import { categoryController } from "../controllers/categoryController";

const router = Router();

router.post("/", categoryController.createCategory);
router.get("/", categoryController.listCategories);
router.get("/:id", categoryController.getCategoryById);
router.put("/:id", categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

export default router;

