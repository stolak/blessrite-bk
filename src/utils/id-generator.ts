/**
 * LiftPay Naming Convention Policy v2.0
 * Issued by: EF Technologies Ltd
 * Product: LiftPay BNPL Platform
 * Effective: October 2025
 */

type LiftPayPrefix =
  | "LPM" // Merchant
  | "LPB" // Buyer
  | "LPL" // Loan
  | "LPP" // Payment
  | "LPI" // Invoice
  | "LPS" // Settlement
  | "LPT" // Ticket/Dispute
  | "LPC" // Credit/Insurance
  | "LPD" // Device
  | "LPN" // Notification
  | "LPX" // Promo/Referral
  | "LPF" // Feedback/Survey
  | "LPA"; // Audit/Compliance

interface LiftPayIdOptions {
  prefix: LiftPayPrefix;
  environment?: "PROD" | "STG" | "DEV";
}

/**
 * A mock in-memory sequence tracker for demonstration.
 * In production, replace with database-backed counter (e.g., Supabase, PostgreSQL sequence).
 */
const sequenceTracker: Record<string, number> = {};

/**
 * Generate standardized LiftPay ID.
 * @param options {prefix, environment}
 */
export function generateLiftPayId(options: LiftPayIdOptions): string {
  const { prefix, environment = "PROD" } = options;

  // 1️⃣ Extract current year & month
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  // 2️⃣ Create unique key for this prefix and month
  const key = `${prefix}-${yy}${mm}`;

  // 3️⃣ Fetch and increment sequence number
  const lastSeq = sequenceTracker[key] || 100000;
  const nextSeq = lastSeq + 1;
  sequenceTracker[key] = nextSeq;

  if (nextSeq > 999999) {
    throw new Error(`Sequence limit exceeded for ${prefix} in ${yy}${mm}`);
  }

  // 4️⃣ Construct ID
  let id = `${prefix}-${yy}${mm}-${nextSeq}`;

  // 5️⃣ Environment suffix
  if (environment === "STG") id += "-STG";
  else if (environment === "DEV") id += "-DEV";

  // 6️⃣ Validation (Max 20 chars, alphanumeric + hyphen)
  if (!/^[A-Z0-9-]+$/.test(id)) {
    throw new Error(`Invalid characters in generated ID: ${id}`);
  }

  return id.toUpperCase();
}

// Merchant
export const generateMerchantId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPM", environment: env });

// Buyer
export const generateBuyerId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPB", environment: env });

// Loan
export const generateLoanId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPL", environment: env });

// Payment
export const generatePaymentId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPP", environment: env });

// Invoice
export const generateInvoiceId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPI", environment: env });

// Settlement
export const generateSettlementId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPS", environment: env });

// Ticket/Dispute
export const generateTicketId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPT", environment: env });

// Credit / Insurance
export const generateCreditId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPC", environment: env });

// Device Fingerprint
export const generateDeviceId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPD", environment: env });

// Notification
export const generateNotificationId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPN", environment: env });

// Promo / Referral
export const generateReferralId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPX", environment: env });

// Feedback / Survey
export const generateFeedbackId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPF", environment: env });

// Audit / Compliance
export const generateAuditId = (env?: "PROD" | "STG" | "DEV") =>
  generateLiftPayId({ prefix: "LPA", environment: env });
