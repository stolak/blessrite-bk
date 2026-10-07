import { Prisma, Status } from "@prisma/client";
import { randomUUID } from "crypto";

export function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  );
}

export function parseStatusQuery(raw: unknown): Status | "All" | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "All") return "All";
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

export function parseBodyStatus(raw: unknown): Status | undefined {
  if (raw === Status.Active || raw === Status.Inactive || raw === Status.Archived) {
    return raw;
  }
  return undefined;
}

export function parseDecimalNonNegative(
  value: string | number,
  fieldName = "value"
): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  if (d.isNegative()) {
    throw new Error(`${fieldName} must be zero or greater`);
  }
  return d;
}

export function parseBodyDecimal(
  raw: unknown,
  fieldName: string
): string | number | "invalid" | "missing" {
  if (raw === undefined) return "missing";
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "invalid";
}

export function parseBodyInt(raw: unknown): number | "invalid" | "missing" {
  if (raw === undefined) return "missing";
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n)) return "invalid";
  return n;
}

export function parseOptionalBoolean(raw: unknown): boolean | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "invalid";
}

export function parseBodyBoolean(raw: unknown): boolean | "invalid" | "missing" {
  if (raw === undefined) return "missing";
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "invalid";
}

export function newVersionId(): string {
  return randomUUID();
}

export function applyStatusFilter(
  where: { status?: unknown },
  status: Status | "All" | undefined
): void {
  if (status === undefined) {
    where.status = Status.Active;
  } else if (status !== "All") {
    where.status = status;
  }
}
