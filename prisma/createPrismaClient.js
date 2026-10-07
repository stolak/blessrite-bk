const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

require("dotenv").config();

function parseMysqlUrl(databaseUrl) {
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
    connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT || 5),
    prepareCacheLength: 0,
  };
}

function createPrismaClient(options = {}) {
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

module.exports = { createPrismaClient, parseMysqlUrl };
