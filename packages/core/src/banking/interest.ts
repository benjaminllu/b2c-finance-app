import type { DepositProduct, FeeWaiver } from "../types";

// Convention: a product's apyBps is its published APY (compounding already included).
// Monthly compounding credits interest monthly at (1+APY)^(1/12)-1 per month, simple inside a partial month.
// Daily compounding grows continuously: (1+APY)^(days/365). Over whole months the two agree; they differ
// only inside a partial month, where daily compounding is slightly ahead.

export const DAYS_PER_MONTH = 365 / 12;
const EPS = 1e-9;

type TierSource = Pick<DepositProduct, "apyTiers" | "tierMode" | "minBalanceForApyCents">;

/** APY in (fractional) basis points that applies at a balance. 0 below the minimum balance to earn APY. */
export function apyBpsAtBalance(p: TierSource, balanceCents: number): number {
  if (balanceCents <= 0 || balanceCents < p.minBalanceForApyCents) return 0;
  const tiers = [...p.apyTiers].sort((a, b) => a.minBalanceCents - b.minBalanceCents);
  if (p.tierMode === "whole_balance") {
    let apy = 0;
    for (const t of tiers) if (t.minBalanceCents <= balanceCents) apy = t.apyBps;
    return apy;
  }
  // blended: each slice earns its own tier's rate; a slice runs to the next tier's minimum.
  let weighted = 0;
  tiers.forEach((t, i) => {
    const hi = tiers[i + 1]?.minBalanceCents ?? t.maxBalanceCents ?? Infinity;
    weighted += Math.max(0, Math.min(balanceCents, hi) - t.minBalanceCents) * t.apyBps;
  });
  return weighted / balanceCents;
}

/** Fee is waived if the user meets a waiver kind, or a balance waiver's threshold is met by the balance. */
export function isFeeWaived(
  p: Pick<DepositProduct, "feeWaivers">,
  balanceCents: number,
  met: readonly FeeWaiver["kind"][] = [],
): boolean {
  return p.feeWaivers.some(
    (w) =>
      met.includes(w.kind) ||
      ((w.kind === "min_daily_balance" || w.kind === "min_average_balance") &&
        w.thresholdCents !== null &&
        balanceCents >= w.thresholdCents),
  );
}

export interface GrowthInput {
  principalCents: number;
  horizonDays: number;
  /** Waiver kinds the user says they meet. */
  metWaivers?: readonly FeeWaiver["kind"][];
  /** Skip the product's monthly fee (used when an offer carries its own fee terms). */
  ignoreFees?: boolean;
}

export interface ProjectionPoint {
  /** Month index; the last point may be a partial month. */
  month: number;
  day: number;
  balanceCents: number;
  cumulativeInterestCents: number;
  cumulativeFeesCents: number;
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  interestCents: number;
  feesCents: number;
  /** principal + interestCents - feesCents, exactly. */
  endBalanceCents: number;
}

/** Month-by-month balance. Fractional cents internally; each output is rounded once. */
export function projectGrowth(p: DepositProduct, input: GrowthInput): ProjectionResult {
  const { principalCents, horizonDays } = input;
  let bal = principalCents;
  let interest = 0;
  let fees = 0;
  let day = 0;
  let month = 0;
  const points: ProjectionPoint[] = [
    { month: 0, day: 0, balanceCents: principalCents, cumulativeInterestCents: 0, cumulativeFeesCents: 0 },
  ];
  let rem = horizonDays;
  while (rem > EPS) {
    const step = Math.min(DAYS_PER_MONTH, rem);
    rem -= step;
    day += step;
    month += 1;
    const apy = apyBpsAtBalance(p, bal) / 10_000;
    const gain =
      p.compounding === "daily"
        ? bal * ((1 + apy) ** (step / 365) - 1)
        : bal * ((1 + apy) ** (1 / 12) - 1) * (step / DAYS_PER_MONTH);
    bal += gain;
    interest += gain;
    if (
      !input.ignoreFees &&
      p.monthlyFeeCents > 0 &&
      step >= DAYS_PER_MONTH - EPS &&
      !isFeeWaived(p, bal, input.metWaivers)
    ) {
      const fee = Math.min(p.monthlyFeeCents, Math.max(0, Math.floor(bal)));
      bal -= fee;
      fees += fee;
    }
    points.push({
      month,
      day: Math.round(day),
      balanceCents: Math.round(bal),
      cumulativeInterestCents: Math.round(interest),
      cumulativeFeesCents: fees,
    });
  }
  const interestCents = Math.round(interest);
  return { points, interestCents, feesCents: fees, endBalanceCents: principalCents + interestCents - fees };
}
