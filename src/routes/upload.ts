import { Router } from "express";
import { uploadController } from "../controllers/uploadController";
import multer from "multer";

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 10, // Maximum 10 files
  },
});

// Single file upload with validation
router.post("/", upload.single("file"), uploadController.uploadFile);

// Multiple files upload with validation
router.post(
  "/multiple",
  upload.array("files", 10),
  uploadController.uploadMultipleFiles
);

// File validation only (no upload)
router.post(
  "/validate",
  upload.array("files", 10),
  uploadController.validateFiles
);

export default router;
