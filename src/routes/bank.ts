import { Router } from "express";
import { bankController } from "../controllers/bankController";

const router = Router();

// Get all banks
router.get("/", bankController.getAllBanks);

// Get banks metadata with statistics
router.get("/metadata", bankController.getBanksMetadata);

// Search banks by name
router.get("/search", bankController.searchBanks);

// Get bank by ID
router.get("/:id", bankController.getBankById);

// Get bank by bank code
router.get("/code/:bankCode", bankController.getBankByCode);

export default router;
