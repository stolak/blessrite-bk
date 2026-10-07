/** Query date: `YYYY-MM-DD` is whole UTC day; full ISO strings pass through. */
export function parseQueryDateStart(v: unknown): "missing" | "invalid" | Date {
  if (v === undefined || v === null) return "missing";
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (!s) return "missing";

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const mo = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const start = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
    return new Date(start);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

/** For inclusive end date: date-only → end of that UTC day; ISO with time unchanged. */
export function parseQueryDateEndInclusive(v: unknown): "missing" | "invalid" | Date {
  if (v === undefined || v === null) return "missing";
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (!s) return "missing";

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const mo = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const end = Date.UTC(y, mo - 1, d, 23, 59, 59, 999);
    return new Date(end);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

