import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Ensure env is available before reading DATABASE_URL (imports can run before server dotenv).
require("dotenv").config();

function parseMysqlUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "").split("?")[0];
  if (!database) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    // Keep pool small for shared hosting (cPanel) process limits
    connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT || 5),
    // Avoid server-side prepared statement cache buildup with Prisma's dynamic SQL
    prepareCacheLength: 0,
  };
}

export function createPrismaClient(
  options: {
    log?: Prisma.LogLevel[];
  } = {}
): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaMariaDb(parseMysqlUrl(databaseUrl));
  return new PrismaClient({
    adapter,
    ...(options.log ? { log: options.log } : {}),
  });
}
