import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth";
import { donationController } from "../controllers/donationController";

const router = Router();

router.use(authenticateJWT);

router.post("/bulk", donationController.createBulkDonations);
router.put("/bulk", donationController.updateBulkDonations);
router.delete("/bulk", donationController.deleteBulkDonations);
router.post("/", donationController.createDonation);
router.get("/summary", donationController.getDonationSummary);
router.get("/grouped", donationController.listDonationsGroupedByReference);
router.get("/", donationController.listDonations);
router.get("/:id", donationController.getDonationById);
router.put("/:id", donationController.updateDonation);
router.delete("/:id", donationController.deleteDonation);

export default router;
