import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function uploadFileToS3(file: any, folder: string) {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!file) throw new Error("File not found");
  if (file.size > 25 * 1024 * 1024) throw new Error("File size exceeds 25MB");

  const originalname = file.originalname || file.name || "upload";
  const contentType = file.mimetype || file.type || "application/octet-stream";
  const key = `uploads/${folder}/${Date.now()}-${originalname}`;

  // Normalize to Buffer
  let buffer;
  if (Buffer.isBuffer(file)) {
    buffer = file;
  } else if (file.buffer && Buffer.isBuffer(file.buffer)) {
    buffer = file.buffer;
  } else if (typeof file.arrayBuffer === "function") {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (file.tempFilePath) {
    buffer = fs.readFileSync(file.tempFilePath);
  } else if (file.path) {
    buffer = fs.readFileSync(file.path);
  } else if (file.data) {
    buffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
  } else {
    throw new Error(
      "Unsupported file input. Expected Buffer, multer file, or Web File."
    );
  }

  try {
    if (!bucket) {
      console.log("S3 bucket not configured");
      // ✅ Upload to local storage
      const localUploadDir = path.join(
        process.cwd(),
        "src/public/document",
        folder
      );

      // Ensure directory exists
      fs.mkdirSync(localUploadDir, { recursive: true });

      const localFilePath = path.join(
        localUploadDir,
        `${Date.now()}-${originalname}`
      );
      fs.writeFileSync(localFilePath, buffer);
      // `${BASE_URL}${uploadedPath.replace(/\\/g, "/")}`;
      const BASE_URL = process.env.RUNNING_PORT
        ? `${process.env.APP_URL}:${process.env.PORT}`
        : `${process.env.APP_URL}`;
      return {
        key,
        url: `${BASE_URL}/${folder}/${path.basename(localFilePath)}`, // You can serve this via static middleware
        mimetype: contentType,
        originalname,
      };
    } else {
      // ✅ Upload to S3
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await s3Client.send(command);
      return {
        key,
        url: `${process.env.AWS_CDN}/${key}`,
        mimetype: contentType,
        originalname,
      };
    }
  } catch (e) {
    console.log("Upload error", e);
    return { key: null, url: null, mimetype: null, originalname: null };
  }
}
