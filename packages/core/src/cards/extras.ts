import { CATEGORIES } from "../types";
import type { CreditCard, SpendProfile } from "../types";
import { DAYS_PER_MONTH, projectedWindowSpend } from "./engine";

export interface FlatRateCardOptions {
  /** Units per dollar; 2 = 2% when the currency is "usd". Default 2. */
  multiplier?: number;
  /** Default "usd". */
  rewardCurrencyId?: string;
  id?: string;
  name?: string;
}

/** The comparison baseline: a flat-rate card with no fee, credits or bonus. Default 2% cash back. */
export function flatRateCard(options: FlatRateCardOptions = {}): CreditCard {
  const multiplier = options.multiplier ?? 2;
  return {
    id: options.id ?? `baseline-flat-${String(multiplier).replace(".", "-")}`,
    name: options.name ?? `Flat ${multiplier}% cash back`,
    issuerId: "optima-baseline",
    network: "visa",
    productFamily: null,
    annualFeeCents: 0,
    firstYearFeeWaived: false,
    rewardCurrencyId: options.rewardCurrencyId ?? "usd",
    baseMultiplier: multiplier,
    earnRules: [],
    capGroups: [],
    credits: [],
    signupBonus: null,
    isBusiness: false,
    foreignTransactionFeeBps: 0,
    imageUrl: null,
    sourceUrl: "https://optima.invalid/baseline",
    lastVerifiedAt: "2026-10-30T00:00:00Z",
    isSample: false,
    affiliateUrl: null,
    isAffiliate: false,
  };
}

export interface SignupBonusFeasibility {
  minSpendCents: number;
  windowDays: number;
  monthlySpendCents: number;
  /** monthlySpendCents / (365 / 12) per day, times windowDays. */
  projectedSpendCents: number;
  feasible: boolean;
  /** How far normal spending falls short of the minimum; 0 when feasible. */
  shortfallCents: number;
  /** Extra spend per month (on top of normal spending) needed to hit the minimum in time; 0 when feasible. */
  extraMonthlySpendCents: number;
}

/**
 * Whether normal spending meets the bonus minimum inside its window, assuming all of the profile goes
 * on this card. Months are 365/12 days long. Returns null when the card has no sign-up bonus.
 */
export function signupBonusFeasibility(
  card: CreditCard,
  spendProfile: SpendProfile,
): SignupBonusFeasibility | null {
  const sub = card.signupBonus;
  if (!sub) return null;
  const monthly = CATEGORIES.reduce((s, c) => s + spendProfile[c], 0);
  const projected = projectedWindowSpend(monthly, sub.windowDays);
  const shortfall = Math.max(0, sub.minSpendCents - projected);
  return {
    minSpendCents: sub.minSpendCents,
    windowDays: sub.windowDays,
    monthlySpendCents: monthly,
    projectedSpendCents: Math.round(projected),
    feasible: shortfall === 0,
    shortfallCents: Math.round(shortfall),
    extraMonthlySpendCents: Math.round(shortfall / (sub.windowDays / DAYS_PER_MONTH)),
  };
}

export type CreditUsage = { kind: "full" } | { kind: "partial"; percent: number } | { kind: "never" };

/** Converts a usage mark to a 0-1 utilization, for ValuationOptions.creditUtilization. */
export function creditUsageToUtilization(usage: CreditUsage): number {
  if (usage.kind === "full") return 1;
  if (usage.kind === "never") return 0;
  if (!(usage.percent >= 0 && usage.percent <= 100)) {
    throw new RangeError(`Partial credit usage must be 0 to 100 percent, got ${usage.percent}`);
  }
  return usage.percent / 100;
}

export interface EffectiveAnnualFee {
  annualFeeCents: number;
  credits: { creditId: string; name: string; faceValueCents: number; usedCents: number }[];
  creditsUsedCents: number;
  /** annualFeeCents - creditsUsedCents; negative when credits used exceed the fee. */
  effectiveFeeCents: number;
}

/** Annual fee minus the credits the user actually uses. Credits missing from creditUsage count as never used. */
export function effectiveAnnualFee(
  card: CreditCard,
  creditUsage: Readonly<Record<string, CreditUsage>>,
): EffectiveAnnualFee {
  const credits = card.credits.map((c) => {
    const usage = creditUsage[c.id];
    const used = usage ? creditUsageToUtilization(usage) : 0;
    return {
      creditId: c.id,
      name: c.name,
      faceValueCents: c.annualValueCents,
      usedCents: Math.round(c.annualValueCents * used),
    };
  });
  const creditsUsedCents = credits.reduce((s, c) => s + c.usedCents, 0);
  return {
    annualFeeCents: card.annualFeeCents,
    credits,
    creditsUsedCents,
    effectiveFeeCents: card.annualFeeCents - creditsUsedCents,
  };
}
