export interface MerchantRiskInput {
  merchantCategory: string;
  merchantCategoryScore: number;
  purchaseUtilizationPercentage: number;
}

export interface MerchantRiskComponent {
  variable: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

export interface MerchantRiskScoreResult {
  score: number;
  components: MerchantRiskComponent[];
}

function assertFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return value;
}

function validateScore(score: number, fieldName: string): void {
  if (!Number.isFinite(score)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (score < 0 || score > 10) {
    throw new Error(`${fieldName} must be between 0 and 10`);
  }
}

function getPurchaseUtilizationScore(utilization: number): number {
  if (!Number.isFinite(utilization)) {
    throw new Error("Purchase utilization must be a valid number");
  }

  if (utilization < 0) {
    throw new Error("Purchase utilization cannot be negative");
  }

  if (utilization < 20) {
    return 10;
  }

  if (utilization <= 40) {
    return 8;
  }

  if (utilization <= 60) {
    return 5;
  }

  if (utilization <= 80) {
    return 3;
  }

  return 0;
}

export function normalizeMerchantRiskInput(raw: Record<string, unknown>): MerchantRiskInput {
  const merchantCategory =
    typeof raw.merchantCategory === "string" ? raw.merchantCategory.trim() : "";
  if (!merchantCategory) {
    throw new Error("Merchant category is required");
  }

  const merchantCategoryScore = assertFiniteNumber(
    raw.merchantCategoryScore,
    "Merchant category score"
  );
  validateScore(merchantCategoryScore, "Merchant category score");

  const purchaseUtilizationPercentage = assertFiniteNumber(
    raw.purchaseUtilizationPercentage,
    "Purchase utilization"
  );

  return {
    merchantCategory,
    merchantCategoryScore,
    purchaseUtilizationPercentage,
  };
}

export function calculateMerchantRiskScore(input: MerchantRiskInput): MerchantRiskScoreResult {
  if (!input.merchantCategory?.trim()) {
    throw new Error("Merchant category is required");
  }

  validateScore(input.merchantCategoryScore, "Merchant category score");

  const utilizationScore = getPurchaseUtilizationScore(input.purchaseUtilizationPercentage);

  const categoryWeightedScore = input.merchantCategoryScore * 0.6;
  const utilizationWeightedScore = utilizationScore * 0.4;
  const score = categoryWeightedScore + utilizationWeightedScore;

  const components: MerchantRiskComponent[] = [
    {
      variable: "Merchant Category Risk",
      rawScore: input.merchantCategoryScore,
      weight: 60,
      weightedScore: categoryWeightedScore,
    },
    {
      variable: "Purchase Utilization",
      rawScore: utilizationScore,
      weight: 40,
      weightedScore: utilizationWeightedScore,
    },
  ];

  return {
    score,
    components,
  };
}

export class MerchantRiskScoreService {
  calculate(raw: Record<string, unknown>): MerchantRiskScoreResult {
    const input = normalizeMerchantRiskInput(raw);
    return calculateMerchantRiskScore(input);
  }
}

export const merchantRiskScoreService = new MerchantRiskScoreService();
