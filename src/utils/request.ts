export type RouteParamValue = string | string[] | undefined;

/** First path segment from Express `req.params` (handles `string | string[]`). */
export function routeParam(value: RouteParamValue): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function routeParamTrimmed(value: RouteParamValue): string {
  return routeParam(value).trim();
}

export function parseIntParam(value: RouteParamValue): number | undefined {
  const raw = routeParam(value);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parsePositiveIntParam(value: RouteParamValue): number | null {
  const n = parseIntParam(value);
  if (n === undefined || n < 1) return null;
  return n;
}

export function parseIntOrUndefined(v: unknown): number | undefined {
  if (typeof v === "string" || Array.isArray(v)) {
    return parseIntParam(v);
  }
  return undefined;
}

export function isStringOrNullOrUndefined(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === "string" || v === "";
}

export function isNumberOrString(v: unknown): v is number | string {
  return typeof v === "number" || typeof v === "string";
}

