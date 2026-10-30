import type { Category, CreditCard, SpendProfile } from "../types";
import { withUniformUtilization } from "./breakeven";
import { annualValue, capBreakpoints, rawNet, type ValuationOptions } from "./engine";
import { envelopeFlips } from "./envelope";

interface Sweep {
  from: number;
  to: number;
  /** Evenly spaced sample count including both ends. Default 11, minimum 2. */
  steps?: number;
}

export type SensitivityVariable =
  | (Sweep & { kind: "cents_per_point"; currencyId: string })
  /** from/to are monthly spend in cents. */
  | (Sweep & { kind: "category_spend"; category: Category })
  /** from/to are a 0-1 share applied to every credit on cardId. */
  | (Sweep & { kind: "credit_utilization"; cardId: string });

export interface SensitivityStep {
  x: number;
  /** Annual net value per card (same order as the input cards), rounded like annualValue. */
  values: { cardId: string; totalCents: number }[];
  /** Card with the highest value; null when the top two tie to the cent. */
  winnerId: string | null;
}

export interface SensitivityFlip {
  /**
   * Exact value of the variable where the winner changes (unrounded: cents per point, monthly cents, or
   * a 0-1 share). Reads as "below `at`, winnerBelowId wins; above it, winnerAboveId wins".
   */
  at: number;
  winnerBelowId: string;
  winnerAboveId: string;
}

export interface SensitivityResult {
  variable: SensitivityVariable;
  steps: SensitivityStep[];
  /** Every winner change inside [from, to], solved exactly (not just between sampled steps). */
  flips: SensitivityFlip[];
}

/**
 * Sweep one input and value every card at each step, plus the exact points where the best card changes.
 * Values are linear in cents-per-point and utilization, and piecewise linear in category spend (cap
 * breakpoints are added as extra nodes), so flips are exact.
 */
export function sensitivity(
  cards: readonly CreditCard[],
  spendProfile: SpendProfile,
  variable: SensitivityVariable,
  options: ValuationOptions,
): SensitivityResult {
  if (variable.kind === "credit_utilization" && !cards.some((c) => c.id === variable.cardId)) {
    throw new Error(`sensitivity: card "${variable.cardId}" is not in the list`);
  }
  const inputs = (card: CreditCard, x: number): [SpendProfile, ValuationOptions] => {
    if (variable.kind === "cents_per_point") {
      return [
        spendProfile,
        { ...options, centsPerPoint: { ...options.centsPerPoint, [variable.currencyId]: x } },
      ];
    }
    if (variable.kind === "category_spend") return [{ ...spendProfile, [variable.category]: x }, options];
    return [spendProfile, card.id === variable.cardId ? withUniformUtilization(card, x, options) : options];
  };

  const { from, to } = variable;
  const n = Math.max(2, variable.steps ?? 11);
  const stepXs = Array.from({ length: n }, (_, i) => (i === n - 1 ? to : from + ((to - from) * i) / (n - 1)));

  const steps = stepXs.map((x) => {
    const values = cards.map((card) => ({
      cardId: card.id,
      totalCents: annualValue(card, ...inputs(card, x)).totalCents,
    }));
    const sorted = [...values].sort((a, b) => b.totalCents - a.totalCents);
    const top = sorted[0];
    const winnerId = top && sorted[1]?.totalCents !== top.totalCents ? top.cardId : null;
    return { x, values, winnerId };
  });

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const nodes = new Set([lo, hi]);
  if (variable.kind === "category_spend") {
    for (const card of cards) {
      for (const b of capBreakpoints(card, spendProfile, variable.category, options))
        if (b > lo && b < hi) nodes.add(b);
    }
  }
  const xs = [...nodes].sort((a, b) => a - b);
  const flips: SensitivityFlip[] =
    xs.length < 2
      ? []
      : envelopeFlips(
          xs,
          xs.map((x) => cards.map((card) => rawNet(card, ...inputs(card, x)))),
        ).flips.map((f) => ({
          at: f.at,
          winnerBelowId: cards[f.from]?.id ?? "",
          winnerAboveId: cards[f.to]?.id ?? "",
        }));

  return { variable, steps, flips };
}
