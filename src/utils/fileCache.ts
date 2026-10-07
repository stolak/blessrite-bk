import fs from "fs-extra";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "cache");

// Ensure cache folder exists
fs.ensureDirSync(CACHE_DIR);

function cacheFilePath(key: string): string {
  // Prevent path traversal / unsafe filenames
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

export async function setCache(
  key: string,
  data: unknown,
  ttlSeconds: number = 300
): Promise<void> {
  const file = cacheFilePath(key);

  await fs.writeJson(
    file,
    {
      expiresAt: Date.now() + ttlSeconds * 1000,
      data,
    },
    { spaces: 0 }
  );
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const file = cacheFilePath(key);

  if (!(await fs.pathExists(file))) {
    return null;
  }

  try {
    const cache = await fs.readJson(file);

    if (typeof cache?.expiresAt !== "number" || Date.now() > cache.expiresAt) {
      await fs.remove(file).catch(() => undefined);
      return null;
    }

    return cache.data as T;
  } catch {
    await fs.remove(file).catch(() => undefined);
    return null;
  }
}

export async function deleteCache(key: string): Promise<void> {
  const file = cacheFilePath(key);

  if (await fs.pathExists(file)) {
    await fs.remove(file);
  }
}

/** Delete all cache files whose key starts with the given prefix. */
export async function deleteCacheByPrefix(prefix: string): Promise<void> {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!(await fs.pathExists(CACHE_DIR))) return;

  const files = await fs.readdir(CACHE_DIR);
  await Promise.all(
    files
      .filter((name) => name.startsWith(safePrefix) && name.endsWith(".json"))
      .map((name) => fs.remove(path.join(CACHE_DIR, name)).catch(() => undefined))
  );
}

export async function clearCache(): Promise<void> {
  if (!(await fs.pathExists(CACHE_DIR))) return;
  await fs.emptyDir(CACHE_DIR);
}
