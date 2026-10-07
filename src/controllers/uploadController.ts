import { Request, Response } from "express";
import { uploadService } from "../services/uploadService";

/**
 * @openapi
 * /api/v1/upload:
 *   post:
 *     summary: Upload a single file with validation
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folder:
 *                 type: string
 *                 description: Destination folder (optional, defaults to "public")
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Validation error or upload failed
 *       500:
 *         description: Server error
 */
export const uploadController = {
  uploadFile: async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const folder = req.body.folder || "public";

      // Get validation parameters from query or body
      const allowedTypes = req.body.allowedTypes
        ? req.body.allowedTypes.split(",")
        : undefined;
      const maxSize = req.body.maxSize
        ? parseInt(req.body.maxSize)
        : 25 * 1024 * 1024; // 25MB default

      const result = await uploadService.uploadFileWithValidation(
        file,
        folder,
        allowedTypes,
        maxSize
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.error("Upload controller error:", error);
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message || "Unknown error occurred",
      });
    }
  },

  /**
   * @openapi
   * /api/v1/upload/multiple:
   *   post:
   *     summary: Upload multiple files with validation
   *     tags: [Upload]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [files]
   *             properties:
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *               folder:
   *                 type: string
   *                 description: Destination folder (optional, defaults to "public")
   *               allowedTypes:
   *                 type: string
   *                 description: Comma-separated list of allowed MIME types
   *               maxSize:
   *                 type: integer
   *                 description: Maximum file size in bytes
   *               maxFiles:
   *                 type: integer
   *                 description: Maximum number of files allowed
   *     responses:
   *       200:
   *         description: Files uploaded successfully
   *       400:
   *         description: Validation error or upload failed
   *       500:
   *         description: Server error
   */
  uploadMultipleFiles: async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const folder = req.body.folder || "public";

      // Get validation parameters from query or body
      const allowedTypes = req.body.allowedTypes
        ? req.body.allowedTypes.split(",")
        : undefined;
      const maxSize = req.body.maxSize
        ? parseInt(req.body.maxSize)
        : 25 * 1024 * 1024; // 25MB default
      const maxFiles = req.body.maxFiles ? parseInt(req.body.maxFiles) : 10; // 10 files default

      const results = await uploadService.uploadMultipleFilesWithValidation(
        files,
        folder,
        allowedTypes,
        maxSize,
        maxFiles
      );

      // Check if all uploads were successful
      const allSuccessful = results.every((result) => result.success);
      const someSuccessful = results.some((result) => result.success);

      if (allSuccessful) {
        res.json({
          success: true,
          message: "All files uploaded successfully",
          data: results,
        });
      } else if (someSuccessful) {
        res.status(207).json({
          // 207 Multi-Status
          success: false,
          message: "Some files failed to upload",
          data: results,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "All files failed to upload",
          data: results,
        });
      }
    } catch (error: any) {
      console.error("Multiple upload controller error:", error);
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message || "Unknown error occurred",
      });
    }
  },

  /**
   * @openapi
   * /api/v1/upload/validate:
   *   post:
   *     summary: Validate files without uploading
   *     tags: [Upload]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [files]
   *             properties:
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *               allowedTypes:
   *                 type: string
   *                 description: Comma-separated list of allowed MIME types
   *               maxSize:
   *                 type: integer
   *                 description: Maximum file size in bytes
   *               maxFiles:
   *                 type: integer
   *                 description: Maximum number of files allowed
   *     responses:
   *       200:
   *         description: Validation results
   *       400:
   *         description: Validation failed
   *       500:
   *         description: Server error
   */
  validateFiles: async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      // Get validation parameters from query or body
      const allowedTypes = req.body.allowedTypes
        ? req.body.allowedTypes.split(",")
        : undefined;
      const maxSize = req.body.maxSize
        ? parseInt(req.body.maxSize)
        : 25 * 1024 * 1024; // 25MB default
      const maxFiles = req.body.maxFiles ? parseInt(req.body.maxFiles) : 10; // 10 files default

      const validation = uploadService.validateMultipleFiles(
        files,
        allowedTypes,
        maxSize,
        maxFiles
      );

      if (validation.isValid) {
        res.json({
          success: true,
          message: "All files are valid",
          data: {
            isValid: validation.isValid,
            validFilesCount: validation.validFiles.length,
            invalidFilesCount: validation.invalidFiles.length,
            validFiles: validation.validFiles.map((file) => ({
              name: file.originalname || file.name,
              size: file.size,
              type: file.mimetype || file.type,
            })),
            invalidFiles: validation.invalidFiles,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: "File validation failed",
          data: {
            isValid: validation.isValid,
            validFilesCount: validation.validFiles.length,
            invalidFilesCount: validation.invalidFiles.length,
            validFiles: validation.validFiles.map((file) => ({
              name: file.originalname || file.name,
              size: file.size,
              type: file.mimetype || file.type,
            })),
            invalidFiles: validation.invalidFiles,
            errors: validation.errors,
          },
        });
      }
    } catch (error: any) {
      console.error("File validation controller error:", error);
      res.status(500).json({
        success: false,
        message: "Validation failed",
        error: error.message || "Unknown error occurred",
      });
    }
  },
};
