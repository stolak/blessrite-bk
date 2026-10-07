import { Router } from "express";
import { termController } from "../controllers/termController";

const router = Router();

router.post("/", termController.createTerm);
router.get("/", termController.listTerms);
router.get("/:id", termController.getTermById);
router.put("/:id", termController.updateTerm);
router.delete("/:id", termController.deleteTerm);

export default router;

