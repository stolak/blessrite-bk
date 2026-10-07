import express from "express";
import cors from "cors";
import apiV1Router from "./routes";
require("dotenv").config();

const app = express();
app.use(cors());
// app.use(
//   cors({
//     origin: ["http://localhost:8080"],
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: [
//       "Content-Type",
//       "Authorization",
//       "X-Requested-With",
//       "Accept",
//       "Origin",
//     ],
//   })
// );

// Allow large bank-statement payloads (PDF/statement conversions can be big).
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT ?? "50mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT ?? "50mb" }));
app.use("/api/v1", apiV1Router);
// Swagger docs
try {
  const { setupSwagger } = require("./utils/swagger");
  setupSwagger(app);
} catch (e) {
  console.log("swagger failed to load:", e);
}

export = app;
