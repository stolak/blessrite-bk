import { AccountType } from "@prisma/client";

export const ACCOUNT_TYPE_VALUES = [AccountType.Cash, AccountType.NonCash] as const;

export function parseAccountType(raw: unknown): AccountType | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  if (raw === AccountType.Cash || raw === AccountType.NonCash) {
    return raw;
  }
  return undefined;
}

/** Reads `accountType` or `accountType` from query (accountType preferred). */
export function parseAccountTypeFromQuery(query: Record<string, unknown>): {
  value?: AccountType;
  error?: string;
} {
  const raw =
    typeof query.accountType === "string"
      ? query.accountType
      : typeof query.accountType === "string"
        ? query.accountType
        : undefined;

  if (raw === undefined) {
    return {};
  }

  const value = parseAccountType(raw);
  if (value === undefined) {
    return {
      error: `accountType must be one of: ${ACCOUNT_TYPE_VALUES.join(", ")}`,
    };
  }
  return { value };
}

/** Reads `accountType` or `accountType` from JSON body. */
export function parseAccountTypeFromBody(
  body: Record<string, unknown>
): AccountType | undefined | "invalid" {
  const raw =
    body.accountType !== undefined
      ? body.accountType
      : body.accountType !== undefined
        ? body.accountType
        : undefined;

  if (raw === undefined) {
    return undefined;
  }

  const parsed = parseAccountType(raw);
  return parsed === undefined ? "invalid" : parsed;
}
