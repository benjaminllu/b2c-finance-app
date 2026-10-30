import type { Category, CreditCard, SpendProfile } from "../types";
import { capBreakpoints, rawNet, type ValuationOptions } from "./engine";
import { envelopeFlips, TIE_EPSILON } from "./envelope";
import { flatRateCard } from "./extras";

export type CardSide = "a" | "b";

export interface BreakEvenCrossing {
  /** Monthly spend in the category where both cards are worth the same (rounded to cents). */
  monthlySpendCents: number;
  /** Card worth more just below this spend. */
  winnerBelow: CardSide;
  winnerAbove: CardSide;
}

export interface BreakEvenCurvePoint {
  monthlySpendCents: number;
  /** Annual net value of each card at this spend (rounded cents). */
  valueACents: number;
  valueBCents: number;
  /** Cards whose cap starts binding exactly here (the curve bends). */
  capReached: CardSide[];
  isCrossing: boolean;
}

export interface BreakEvenSpendResult {
  category: Category;
  /** Every spend level where the winner flips, ascending. Empty when one card always wins (or they tie). */
  crossings: BreakEvenCrossing[];
  /** Set only when there is no crossing: the card that wins at every spend level, or "tie" if identical. */
  alwaysWinner: CardSide | "tie" | null;
  /** Chart points from 0 to the range end: every cap breakpoint and crossing; linear in between. */
  curve: BreakEvenCurvePoint[];
}

export interface BreakEvenSpendOptions extends ValuationOptions {
  /** Where the returned curve stops. Default: max($2,000, 1.25 x the last breakpoint or crossing). */
  maxMonthlySpendCents?: number;
}

/**
 * The monthly spend in `category` at which card A's annual value equals card B's, holding every other
 * category at `rest` (rest[category] is ignored). Values are piecewise linear in spend because of caps,
 * so this solves exactly segment by segment, over all spend levels from 0 upwards.
 */
export function breakEvenSpend(
  cardA: CreditCard,
  cardB: CreditCard,
  category: Category,
  rest: SpendProfile,
  options: BreakEvenSpendOptions,
): BreakEvenSpendResult {
  const value = (card: CreditCard, x: number) => rawNet(card, { ...rest, [category]: x }, options);
  const capsA = capBreakpoints(cardA, rest, category, options);
  const capsB = capBreakpoints(cardB, rest, category, options);
  const xs = [...new Set([0, ...capsA, ...capsB])].sort((a, b) => a - b);
  const last = xs[xs.length - 1] ?? 0;
  const probe = last + 100_000;
  xs.push(probe);
  // Past the last breakpoint both values are linear: add a node beyond any tail crossing.
  const dLast = value(cardA, last) - value(cardB, last);
  const dProbe = value(cardA, probe) - value(cardB, probe);
  if (dLast !== dProbe) {
    const root = last + (dLast * (probe - last)) / (dLast - dProbe);
    if (root >= probe) xs.push(root * 2);
  }
  const ys = xs.map((x) => [value(cardA, x), value(cardB, x)]);
  const side = (i: number): CardSide => (i === 0 ? "a" : "b");
  const { first, flips } = envelopeFlips(xs, ys);
  const tie = ys.every(([a = 0, b = 0]) => Math.abs(a - b) <= TIE_EPSILON);

  const crossings = flips.map((f) => ({
    monthlySpendCents: Math.round(f.at),
    winnerBelow: side(f.from),
    winnerAbove: side(f.to),
  }));
  const end =
    options.maxMonthlySpendCents ??
    Math.max(200_000, 1.25 * Math.max(...capsA, ...capsB, ...flips.map((f) => f.at), 0));
  const pointXs = [...new Set([0, ...capsA, ...capsB, ...flips.map((f) => f.at), end])]
    .filter((x) => x <= end)
    .sort((a, b) => a - b);
  const curve = pointXs.map((x) => {
    const capReached: CardSide[] = [];
    if (capsA.includes(x)) capReached.push("a");
    if (capsB.includes(x)) capReached.push("b");
    return {
      monthlySpendCents: Math.round(x),
      valueACents: Math.round(value(cardA, x)),
      valueBCents: Math.round(value(cardB, x)),
      capReached,
      isCrossing: flips.some((f) => f.at === x),
    };
  });

  return {
    category,
    crossings,
    alwaysWinner: crossings.length > 0 ? null : tie ? "tie" : side(first),
    curve,
  };
}

export type UtilizationBreakEvenStatus = "wins_at_zero" | "needs_utilization" | "loses_at_full";

export interface UtilizationBreakEven {
  status: UtilizationBreakEvenStatus;
  /** Minimum uniform share (0-1) of A's credits needed to tie B; 0 when A wins anyway; null when impossible. */
  utilization: number | null;
  /** Minimum credit dollars used (cents) for A to tie B; null when impossible. */
  creditsUsedCents: number | null;
  /** Total face value of A's credits per year. */
  creditFaceValueCents: number;
  /** How much A trails B with every credit fully used; 0 unless status is "loses_at_full". */
  shortfallAtFullCents: number;
}

/**
 * The minimum share of card A's credits the user must use (same share for every credit) for A to match B.
 * B is valued with the utilization given in options; A's own utilization settings are ignored.
 */
export function breakEvenCreditUtilization(
  cardA: CreditCard,
  cardB: CreditCard,
  spendProfile: SpendProfile,
  options: ValuationOptions,
): UtilizationBreakEven {
  const face = cardA.credits.reduce((s, c) => s + c.annualValueCents, 0);
  const atZero = rawNet(cardA, spendProfile, withUniformUtilization(cardA, 0, options));
  const target = rawNet(cardB, spendProfile, options);
  const gap = target - atZero;
  if (gap <= TIE_EPSILON) {
    return {
      status: "wins_at_zero",
      utilization: 0,
      creditsUsedCents: 0,
      creditFaceValueCents: face,
      shortfallAtFullCents: 0,
    };
  }
  if (gap > face + TIE_EPSILON) {
    return {
      status: "loses_at_full",
      utilization: null,
      creditsUsedCents: null,
      creditFaceValueCents: face,
      shortfallAtFullCents: Math.round(gap - face),
    };
  }
  return {
    status: "needs_utilization",
    utilization: Math.min(1, gap / face),
    creditsUsedCents: Math.round(gap),
    creditFaceValueCents: face,
    shortfallAtFullCents: 0,
  };
}

/** Options with every credit on `card` set to the same utilization. */
export function withUniformUtilization(
  card: CreditCard,
  utilization: number,
  options: ValuationOptions,
): ValuationOptions {
  const creditUtilization = { ...options.creditUtilization };
  for (const c of card.credits) creditUtilization[c.id] = utilization;
  return { ...options, creditUtilization };
}

export interface AnnualFeeBreakEven {
  /**
   * Highest annual fee at which the card still ties the baseline for this profile. Negative when the
   * card loses even with no fee. Computed with the fee charged (firstYearFeeWaived ignored).
   */
  maxAnnualFeeCents: number;
  currentAnnualFeeCents: number;
  /** maxAnnualFeeCents - currentAnnualFeeCents: how much the fee could rise before the card stops winning. */
  headroomCents: number;
  /** Whether the card, as it is (fee waiver included in the first-year view), ties or beats the baseline. */
  beatsBaseline: boolean;
  baselineCardId: string;
}

/** The highest annual fee at which `card` still ties `baseline` (default: flat 2% cash back). */
export function breakEvenAnnualFee(
  card: CreditCard,
  spendProfile: SpendProfile,
  options: ValuationOptions,
  baseline: CreditCard = flatRateCard(),
): AnnualFeeBreakEven {
  const baseValue = rawNet(baseline, spendProfile, options);
  const gross = rawNet({ ...card, annualFeeCents: 0, firstYearFeeWaived: false }, spendProfile, options);
  const maxAnnualFeeCents = Math.round(gross - baseValue);
  return {
    maxAnnualFeeCents,
    currentAnnualFeeCents: card.annualFeeCents,
    headroomCents: maxAnnualFeeCents - card.annualFeeCents,
    beatsBaseline: rawNet(card, spendProfile, options) >= baseValue - TIE_EPSILON,
    baselineCardId: baseline.id,
  };
}
