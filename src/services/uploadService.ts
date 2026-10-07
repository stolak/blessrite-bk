import { uploadFileToS3 } from "./awsService";

export interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    key: string;
    url: string;
    mimetype: string;
    originalname: string;
  };
  error?: string;
}

export class UploadService {
  /**
   * Upload a single file to S3 or local storage
   * @param file - The file to upload (multer file object, Buffer, or Web File)
   * @param folder - The folder path in S3/local storage (e.g., 'documents', 'images')
   * @returns UploadResponse with file details
   */
  async uploadFile(file: any, folder: string): Promise<UploadResponse> {
    try {
      if (!file) {
        return {
          success: false,
          message: "No file provided",
          error: "File is required",
        };
      }

      const uploadResult = await uploadFileToS3(file, (folder = "public"));

      if (!uploadResult.key || !uploadResult.url) {
        return {
          success: false,
          message: "Upload failed",
          error: "File upload returned invalid response",
        };
      }

      return {
        success: true,
        message: "File uploaded successfully",
        data: {
          key: uploadResult.key,
          url: uploadResult.url,
          mimetype: uploadResult.mimetype || "application/octet-stream",
          originalname: uploadResult.originalname || "unknown",
        },
      };
    } catch (error: any) {
      console.error("Upload error:", error);
      return {
        success: false,
        message: "Upload failed",
        error: error.message || "Unknown error occurred",
      };
    }
  }

  /**
   * Validate multiple files before uploading
   * @param files - Array of files to validate
   * @param allowedTypes - Array of allowed MIME types
   * @param maxSize - Maximum file size in bytes (default: 25MB)
   * @param maxFiles - Maximum number of files allowed (default: 10)
   * @returns Object with validation results
   */
  validateMultipleFiles(
    files: any[],
    allowedTypes?: string[],
    maxSize: number = 25 * 1024 * 1024,
    maxFiles: number = 10
  ): {
    isValid: boolean;
    validFiles: any[];
    invalidFiles: Array<{ file: any; error: string }>;
    errors: string[];
  } {
    const errors: string[] = [];
    const validFiles: any[] = [];
    const invalidFiles: Array<{ file: any; error: string }> = [];

    // Check if files array is provided
    if (!files || files.length === 0) {
      return {
        isValid: false,
        validFiles: [],
        invalidFiles: [],
        errors: ["No files provided"],
      };
    }

    // Check maximum number of files
    if (files.length > maxFiles) {
      errors.push(
        `Too many files. Maximum ${maxFiles} files allowed, received ${files.length}`
      );
      return {
        isValid: false,
        validFiles: [],
        invalidFiles: files.map((file) => ({
          file,
          error: "Exceeds maximum file limit",
        })),
        errors,
      };
    }

    // Validate each file
    files.forEach((file, index) => {
      if (!file) {
        invalidFiles.push({ file, error: "File is null or undefined" });
        return;
      }

      // Check file size
      const fileSize = file.size || file.buffer?.length || 0;
      if (fileSize === 0) {
        invalidFiles.push({ file, error: "File is empty" });
        return;
      }

      if (fileSize > maxSize) {
        invalidFiles.push({
          file,
          error: `File size (${fileSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
        });
        return;
      }

      // Check file type
      if (allowedTypes && allowedTypes.length > 0) {
        const fileType =
          file.mimetype || file.type || "application/octet-stream";
        if (!allowedTypes.includes(fileType)) {
          invalidFiles.push({
            file,
            error: `File type '${fileType}' is not allowed. Allowed types: ${allowedTypes.join(
              ", "
            )}`,
          });
          return;
        }
      }

      // Check file name
      const fileName = file.originalname || file.name || `file_${index}`;
      if (!fileName || fileName.trim() === "") {
        invalidFiles.push({ file, error: "File name is empty or invalid" });
        return;
      }

      // File passed all validations
      validFiles.push(file);
    });

    // Compile all errors
    if (invalidFiles.length > 0) {
      errors.push(`${invalidFiles.length} file(s) failed validation`);
    }

    const isValid = invalidFiles.length === 0 && validFiles.length > 0;

    return {
      isValid,
      validFiles,
      invalidFiles,
      errors,
    };
  }

  /**
   * Upload multiple files to S3 or local storage
   * @param files - Array of files to upload
   * @param folder - The folder path in S3/local storage
   * @returns Array of UploadResponse objects
   */
  async uploadMultipleFiles(
    files: any[],
    folder: string
  ): Promise<UploadResponse[]> {
    if (!files || files.length === 0) {
      return [
        {
          success: false,
          message: "No files provided",
          error: "Files array is empty",
        },
      ];
    }

    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Upload multiple files with validation
   * @param files - Array of files to upload
   * @param folder - The folder path in S3/local storage
   * @param allowedTypes - Array of allowed MIME types
   * @param maxSize - Maximum file size in bytes (default: 25MB)
   * @param maxFiles - Maximum number of files allowed (default: 10)
   * @returns Array of UploadResponse objects
   */
  async uploadMultipleFilesWithValidation(
    files: any[],
    folder: string,
    allowedTypes?: string[],
    maxSize: number = 25 * 1024 * 1024,
    maxFiles: number = 10
  ): Promise<UploadResponse[]> {
    // Validate files first
    const validation = this.validateMultipleFiles(
      files,
      allowedTypes,
      maxSize,
      maxFiles
    );

    if (!validation.isValid) {
      // Return error responses for all files
      return files.map((file) => ({
        success: false,
        message: "File validation failed",
        error: validation.errors.join("; "),
      }));
    }

    // Upload only valid files
    const uploadPromises = validation.validFiles.map((file) =>
      this.uploadFile(file, folder)
    );
    const uploadResults = await Promise.all(uploadPromises);

    // Combine upload results with validation errors for invalid files
    const allResults: UploadResponse[] = [];

    // Add results for valid files
    allResults.push(...uploadResults);

    // Add error results for invalid files
    validation.invalidFiles.forEach(({ error }) => {
      allResults.push({
        success: false,
        message: "File validation failed",
        error,
      });
    });

    return allResults;
  }

  /**
   * Upload a file with custom validation
   * @param file - The file to upload
   * @param folder - The folder path
   * @param allowedTypes - Array of allowed MIME types
   * @param maxSize - Maximum file size in bytes (default: 25MB)
   * @returns UploadResponse with file details
   */
  async uploadFileWithValidation(
    file: any,
    folder: string,
    allowedTypes?: string[],
    maxSize: number = 25 * 1024 * 1024
  ): Promise<UploadResponse> {
    try {
      // Validate file
      if (!file) {
        return {
          success: false,
          message: "No file provided",
          error: "File is required",
        };
      }

      // Check file size
      const fileSize = file.size || file.buffer?.length || 0;
      if (fileSize > maxSize) {
        return {
          success: false,
          message: "File size exceeds limit",
          error: `File size (${fileSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
        };
      }

      // Check file type
      if (allowedTypes && allowedTypes.length > 0) {
        const fileType =
          file.mimetype || file.type || "application/octet-stream";
        if (!allowedTypes.includes(fileType)) {
          return {
            success: false,
            message: "File type not allowed",
            error: `File type '${fileType}' is not allowed. Allowed types: ${allowedTypes.join(
              ", "
            )}`,
          };
        }
      }

      // Proceed with upload
      return await this.uploadFile(file, folder);
    } catch (error: any) {
      console.error("Upload validation error:", error);
      return {
        success: false,
        message: "Upload validation failed",
        error: error.message || "Unknown error occurred",
      };
    }
  }
}

export const uploadService = new UploadService();
