import crypto from "crypto";
import prisma from "../utils/prisma";

export type NormalizedBankStatementTransaction = {
  // id: string;
  narration: string;
  amount: number;
  type: "credit" | "debit";
  category: string;
  date: string;
  balance: number;
};

function monthKeyFromIsoDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "1970-01";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Keep only records that fall within the most recent 6 months present in the data.
 *
 * - Finds the most recent month in the input (based on `date`)
 * - Keeps transactions for that month + previous 5 months
 * - Excludes any transactions older than that 6-month window
 */
export function keepMostRecentSixMonths<T extends { date: string }>(rows: T[]): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const monthKeys = rows
    .map((r) => monthKeyFromIsoDate(r.date))
    .filter((k) => typeof k === "string" && k.length === 7);

  const uniqueMonthsDesc = Array.from(new Set(monthKeys)).sort((a, b) => b.localeCompare(a));
  const allowedMonths = new Set(uniqueMonthsDesc.slice(0, 6));

  return rows.filter((r) => allowedMonths.has(monthKeyFromIsoDate(r.date)));
}

type GtbankStatementFull = {
  transactions?: Array<{
    sequence?: number;
    transaction_date?: string;
    value_date?: string;
    reference?: string | null;
    type?: "credit" | "debit" | string;
    amount?: number | string | null;
    debit?: number | string | null;
    credit?: number | string | null;
    balance?: number | string | null;
    originating_branch?: string | null;
    description?: string | null;
  }>;
};

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return new Date(0).toISOString();
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) return d.toISOString();

  // Handle common PDF-extract style dates like "01-Aug-2025" if they show up.
  const m = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const [_, dd, mon, yyyy] = m;
    const parsed = new Date(`${dd} ${mon} ${yyyy} 00:00:00 UTC`);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function stableTxnId(seed: string): string {
  // 24 hex chars gives an ObjectId-like id (matches your example shape).
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 24);
}

/**
 * Convert `gtbank_statement_full.json`-style data to the normalized transaction array.
 *
 * Accepts either:
 * - the full parsed JSON object (with a `transactions` array), OR
 * - the `transactions` array itself.
 */
export function convertGtbankStatementFullToNormalizedTransactions(
  input: unknown
): NormalizedBankStatementTransaction[] {
  const txns = Array.isArray(input)
    ? input
    : (input as GtbankStatementFull | null | undefined)?.transactions;

  if (!Array.isArray(txns)) return [];

  return txns.map((t: any) => {
    const type: "credit" | "debit" =
      String(t?.type).toLowerCase() === "credit" ? "credit" : "debit";

    const rawAmount = t?.amount ?? (type === "credit" ? t?.credit : t?.debit) ?? 0;
    const amount = Math.abs(toNumber(rawAmount));

    const date = toIsoDate(t?.transaction_date ?? t?.value_date);
    const balance = toNumber(t?.balance);

    const narration = String(t?.description ?? t?.narration ?? "").trim();
    const category = String(t?.category ?? t?.originating_branch ?? "UNKNOWN").trim() || "UNKNOWN";

    const seed = `${t?.sequence ?? ""}|${date}|${type}|${amount}|${balance}|${narration}`;

    return {
      // id: stableTxnId(seed),
      narration,
      amount,
      type,
      category,
      date,
      balance,
    };
  });
}

export interface OTPResult {
  otp: string;
  expiresAt: Date;
  success: boolean;
  message: string;
}

export interface DashboardStats {
  totalActiveBuyers: number;
  totalActiveMerchants: number;
  totalActiveUsers: number;
  timestamp: string;
  totalActiveLoans: number;
  totalTransactions: number;
  totalRevenue: number;
}

export class HelperService {
  private readonly OTP_LENGTH = 4;
  private readonly OTP_EXPIRY_MINUTES = 5;

  /**
   * Generate OTP for phone number verification
   */
  async generatePhoneOTP(phoneNumber: string): Promise<OTPResult> {
    try {
      // Validate phone number format (basic validation)
      if (!phoneNumber || phoneNumber.trim().length < 10) {
        return {
          otp: "",
          expiresAt: new Date(),
          success: false,
          message: "Invalid phone number format",
        };
      }

      // Generate 4-digit OTP
      const otp = this.generateNumericOTP();

      // Calculate expiry time (5 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      // In a real application, you would store this OTP in database/cache
      // For now, we'll just log it (remove this in production)
      console.log(`📱 Phone OTP for ${phoneNumber}: ${otp} (expires: ${expiresAt.toISOString()})`);

      return {
        otp,
        expiresAt,
        success: true,
        message: `OTP sent successfully to ${phoneNumber}`,
      };
    } catch (error) {
      console.error("Error generating phone OTP:", error);
      return {
        otp: "",
        expiresAt: new Date(),
        success: false,
        message: "Failed to generate phone OTP",
      };
    }
  }

  /**
   * Generate OTP for email verification
   */
  async generateEmailOTP(email: string): Promise<OTPResult> {
    try {
      // Validate email format
      if (!email || !this.isValidEmail(email)) {
        return {
          otp: "",
          expiresAt: new Date(),
          success: false,
          message: "Invalid email format",
        };
      }

      // Generate 4-digit OTP
      const otp = this.generateNumericOTP();

      // Calculate expiry time (5 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      // In a real application, you would store this OTP in database/cache
      // For now, we'll just log it (remove this in production)
      console.log(`📧 Email OTP for ${email}: ${otp} (expires: ${expiresAt.toISOString()})`);

      return {
        otp,
        expiresAt,
        success: true,
        message: `OTP sent successfully to ${email}`,
      };
    } catch (error) {
      console.error("Error generating email OTP:", error);
      return {
        otp: "",
        expiresAt: new Date(),
        success: false,
        message: "Failed to generate email OTP",
      };
    }
  }

  /**
   * Generate a random numeric OTP
   */
  private generateNumericOTP(): string {
    // Generate cryptographically secure random number
    const randomBytes = crypto.randomBytes(4);
    const randomNumber = randomBytes.readUInt32BE(0);

    // Convert to 4-digit string with leading zeros if needed
    const otp = (randomNumber % 10000).toString().padStart(this.OTP_LENGTH, "0");

    return otp;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Verify OTP (for future use)
   */
  async verifyOTP(otp: string, storedOTP: string, expiresAt: Date): Promise<boolean> {
    try {
      // Check if OTP is expired
      if (new Date() > expiresAt) {
        return false;
      }

      // Check if OTP matches
      return otp === storedOTP;
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return false;
    }
  }

  /**
   * Generate alphanumeric OTP (alternative method)
   */
  generateAlphanumericOTP(length: number = 6): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      result += chars[randomIndex];
    }

    return result;
  }

  /**
   * Generate secure token (for other uses)
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Get dashboard statistics including total active buyers and merchants
   */
  async getDashboardStats(): Promise<DashboardStats> {
    // Calculate total active users
    return {
      totalActiveUsers: 0,
      totalActiveBuyers: 0,
      totalActiveMerchants: 0,
      totalActiveLoans: 0,
      totalTransactions: 0,
      totalRevenue: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export const helperService = new HelperService();
