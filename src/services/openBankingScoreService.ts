export interface OpenBankingInput {
  averageMonthlyIncome: number;
  incomeStabilityVariance: number;
  netCashFlowPercentage: number;
  liquidityMonths: number;
  nsfEvents: number;
  overdraftFrequency: number;
  loanBurdenPercentage: number;
}

export interface OpenBankingScoreComponent {
  variable: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

export interface OpenBankingScoreResult {
  totalScore: number;
  components: OpenBankingScoreComponent[];
}

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

export function normalizeOpenBankingInput(raw: Record<string, unknown>): OpenBankingInput {
  return {
    averageMonthlyIncome: assertNonNegativeNumber(
      raw.averageMonthlyIncome,
      "averageMonthlyIncome"
    ),
    incomeStabilityVariance: assertNonNegativeNumber(
      raw.incomeStabilityVariance,
      "incomeStabilityVariance"
    ),
    netCashFlowPercentage: assertFiniteNumber(raw.netCashFlowPercentage, "netCashFlowPercentage"),
    liquidityMonths: assertNonNegativeNumber(raw.liquidityMonths, "liquidityMonths"),
    nsfEvents: assertNonNegativeNumber(raw.nsfEvents, "nsfEvents"),
    overdraftFrequency: assertNonNegativeNumber(raw.overdraftFrequency, "overdraftFrequency"),
    loanBurdenPercentage: assertNonNegativeNumber(
      raw.loanBurdenPercentage,
      "loanBurdenPercentage"
    ),
  };
}

export function calculateOpenBankingScore(input: OpenBankingInput): OpenBankingScoreResult {
  const monthlyIncomeScore =
    input.averageMonthlyIncome > 8000
      ? 10
      : input.averageMonthlyIncome >= 6000
        ? 8
        : input.averageMonthlyIncome >= 4000
          ? 6
          : input.averageMonthlyIncome >= 2500
            ? 4
            : 2;

  const incomeStabilityScore =
    input.incomeStabilityVariance < 10
      ? 10
      : input.incomeStabilityVariance <= 20
        ? 8
        : input.incomeStabilityVariance <= 30
          ? 5
          : 2;

  const cashFlowScore =
    input.netCashFlowPercentage > 40
      ? 10
      : input.netCashFlowPercentage >= 25
        ? 8
        : input.netCashFlowPercentage >= 10
          ? 5
          : input.netCashFlowPercentage >= 0
            ? 2
            : 0;

  const liquidityScore =
    input.liquidityMonths > 6
      ? 10
      : input.liquidityMonths >= 4
        ? 8
        : input.liquidityMonths >= 2
          ? 5
          : input.liquidityMonths >= 1
            ? 2
            : 0;

  const nsfScore =
    input.nsfEvents === 0
      ? 10
      : input.nsfEvents === 1
        ? 7
        : input.nsfEvents === 2
          ? 4
          : 0;

  const overdraftScore =
    input.overdraftFrequency === 0
      ? 10
      : input.overdraftFrequency <= 2
        ? 7
        : input.overdraftFrequency <= 4
          ? 4
          : 0;

  const loanBurdenScore =
    input.loanBurdenPercentage < 10
      ? 10
      : input.loanBurdenPercentage <= 20
        ? 8
        : input.loanBurdenPercentage <= 35
          ? 5
          : 0;

  const components: OpenBankingScoreComponent[] = [
    {
      variable: "Average Monthly Income",
      rawScore: monthlyIncomeScore,
      weight: 15,
      weightedScore: monthlyIncomeScore * 0.15,
    },
    {
      variable: "Income Stability",
      rawScore: incomeStabilityScore,
      weight: 20,
      weightedScore: incomeStabilityScore * 0.2,
    },
    {
      variable: "Net Cash Flow",
      rawScore: cashFlowScore,
      weight: 25,
      weightedScore: cashFlowScore * 0.25,
    },
    {
      variable: "Liquidity Buffer",
      rawScore: liquidityScore,
      weight: 7.5,
      weightedScore: liquidityScore * 0.075,
    },
    {
      variable: "NSF Events",
      rawScore: nsfScore,
      weight: 10,
      weightedScore: nsfScore * 0.1,
    },
    {
      variable: "Overdraft Frequency",
      rawScore: overdraftScore,
      weight: 7.5,
      weightedScore: overdraftScore * 0.075,
    },
    {
      variable: "Existing Loan Burden",
      rawScore: loanBurdenScore,
      weight: 15,
      weightedScore: loanBurdenScore * 0.15,
    },
  ];

  const totalScore = components.reduce(
    (total, component) => total + component.weightedScore,
    0
  );

  return {
    totalScore,
    components,
  };
}

export class OpenBankingScoreService {
  calculate(raw: Record<string, unknown>): OpenBankingScoreResult {
    const input = normalizeOpenBankingInput(raw);
    return calculateOpenBankingScore(input);
  }
}

export const openBankingScoreService = new OpenBankingScoreService();
