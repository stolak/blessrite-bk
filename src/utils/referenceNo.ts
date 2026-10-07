import { randomUUID } from "crypto";

/**
 * Dated transaction reference: `{prefix}-{YYYYMMDD}-{8-char-uuid}` using UTC date.
 */
export function generateReferenceNo(prefix: string, at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${prefix}-${y}${m}${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
