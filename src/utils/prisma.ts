import { createPrismaClient } from "./createPrismaClient";

// Single PrismaClient instance (JS client engine + MariaDB driver adapter).
// Avoids the native Rust query engine, which can crash under concurrency on cPanel.
const prisma = createPrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
