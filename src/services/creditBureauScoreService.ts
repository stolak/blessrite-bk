export type CreditBureauCollectionsStatus = "NONE" | "PAID" | "ACTIVE";

export type CreditBureauBankruptcyStatus =
  | "NONE"
  | "DISCHARGED_OVER_5_YEARS"
  | "ACTIVE_OR_RECENT";

export interface CreditBureauInput {
  creditScore: number;
  utilizationPercentage: number;
  delinquencies24Months: number;
  collections: CreditBureauCollectionsStatus;
  hardInquiries12Months: number;
  bankruptcy: CreditBureauBankruptcyStatus;
}

export interface CreditBureauComponent {
  variable: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

export interface CreditBureauScoreResult {
  rawWeightedScore: number;
  score: number;
  components: CreditBureauComponent[];
}

const COLLECTIONS_VALUES: CreditBureauCollectionsStatus[] = ["NONE", "PAID", "ACTIVE"];
const BANKRUPTCY_VALUES: CreditBureauBankruptcyStatus[] = [
  "NONE",
  "DISCHARGED_OVER_5_YEARS",
  "ACTIVE_OR_RECENT",
];

function assertFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return value;
}

function assertNonNegativeNumber(value: unknown, fieldName: string): number {
  const n = assertFiniteNumber(value, fieldName);
  if (n < 0) {
    throw new Error(`${fieldName} must be greater than or equal to 0`);
  }
  return n;
}

function assertIntegerNonNegative(value: unknown, fieldName: string): number {
  const n = assertNonNegativeNumber(value, fieldName);
  if (!Number.isInteger(n)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  return n;
}

function assertOneOf<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[]
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${fieldName} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function normalizeCreditBureauInput(raw: Record<string, unknown>): CreditBureauInput {
  return {
    creditScore: assertNonNegativeNumber(raw.creditScore, "creditScore"),
    utilizationPercentage: assertNonNegativeNumber(
      raw.utilizationPercentage,
      "utilizationPercentage"
    ),
    delinquencies24Months: assertIntegerNonNegative(
      raw.delinquencies24Months,
      "delinquencies24Months"
    ),
    collections: assertOneOf(raw.collections, "collections", COLLECTIONS_VALUES),
    hardInquiries12Months: assertIntegerNonNegative(
      raw.hardInquiries12Months,
      "hardInquiries12Months"
    ),
    bankruptcy: assertOneOf(raw.bankruptcy, "bankruptcy", BANKRUPTCY_VALUES),
  };
}

export function calculateCreditBureauScore(input: CreditBureauInput): CreditBureauScoreResult {
  const creditScore =
    input.creditScore >= 800
      ? 10
      : input.creditScore >= 750
        ? 9
        : input.creditScore >= 700
          ? 8
          : input.creditScore >= 650
            ? 6
            : input.creditScore >= 600
              ? 4
              : input.creditScore >= 550
                ? 2
                : 0;

  const utilizationScore =
    input.utilizationPercentage <= 30
      ? 10
      : input.utilizationPercentage <= 50
        ? 8
        : input.utilizationPercentage <= 70
          ? 5
          : input.utilizationPercentage <= 90
            ? 2
            : 0;

  const delinquencyScore =
    input.delinquencies24Months === 0
      ? 10
      : input.delinquencies24Months === 1
        ? 8
        : input.delinquencies24Months === 2
          ? 5
          : input.delinquencies24Months === 3
            ? 2
            : 0;

  const collectionsScore =
    input.collections === "NONE" ? 10 : input.collections === "PAID" ? 5 : 0;

  const inquiriesScore =
    input.hardInquiries12Months <= 2
      ? 10
      : input.hardInquiries12Months <= 5
        ? 7
        : input.hardInquiries12Months <= 8
          ? 4
          : 0;

  const bankruptcyScore =
    input.bankruptcy === "NONE"
      ? 10
      : input.bankruptcy === "DISCHARGED_OVER_5_YEARS"
        ? 5
        : 0;

  const components: CreditBureauComponent[] = [
    {
      variable: "Credit Score",
      rawScore: creditScore,
      weight: 35,
      weightedScore: creditScore * 0.35,
    },
    {
      variable: "Utilization",
      rawScore: utilizationScore,
      weight: 15,
      weightedScore: utilizationScore * 0.15,
    },
    {
      variable: "Delinquencies",
      rawScore: delinquencyScore,
      weight: 15,
      weightedScore: delinquencyScore * 0.15,
    },
    {
      variable: "Collections",
      rawScore: collectionsScore,
      weight: 25,
      weightedScore: collectionsScore * 0.25,
    },
    {
      variable: "Inquiries",
      rawScore: inquiriesScore,
      weight: 5,
      weightedScore: inquiriesScore * 0.05,
    },
    {
      variable: "Bankruptcy",
      rawScore: bankruptcyScore,
      weight: 5,
      weightedScore: bankruptcyScore * 0.05,
    },
  ];

  const rawWeightedScore = components.reduce(
    (total, component) => total + component.weightedScore,
    0
  );

  const score = rawWeightedScore * 10;

  return {
    rawWeightedScore,
    score,
    components,
  };
}

export class CreditBureauScoreService {
  calculate(raw: Record<string, unknown>): CreditBureauScoreResult {
    const input = normalizeCreditBureauInput(raw);
    return calculateCreditBureauScore(input);
  }
}

export const creditBureauScoreService = new CreditBureauScoreService();
