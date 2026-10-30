import { CATEGORIES, CATEGORY_LABELS, type CreditCard, type RewardCurrency } from "@optima/core";
import {
  annualValue,
  breakEvenAnnualFee,
  breakEvenCreditUtilization,
  breakEvenSpend,
  creditUsageToUtilization,
  effectiveAnnualFee,
  flatRateCard,
  optimizeWallet,
  signupBonusFeasibility,
  type AnnualValueResult,
  type CreditUsage,
  type ValuationOptions,
} from "@optima/core/cards";
import { formatCentsWhole } from "@/lib/format";
import type { CardsState } from "./state";

export function usageOf(percent: number): CreditUsage {
  return percent >= 100 ? { kind: "full" } : percent <= 0 ? { kind: "never" } : { kind: "partial", percent };
}

export function buildOptions(currencies: RewardCurrency[], state: CardsState): ValuationOptions {
  return {
    currencies,
    centsPerPoint: state.centsPerPoint,
    creditUtilization: Object.fromEntries(
      Object.entries(state.creditPercent).map(([id, p]) => [id, creditUsageToUtilization(usageOf(p))]),
    ),
    view: state.view,
  };
}

/** One sentence on why the winner beats the runner-up: the biggest positive driver of the gap. */
export function explainWin(
  winner: { name: string; result: AnnualValueResult },
  runnerUp: { name: string; result: AnnualValueResult },
): string {
  const w = winner.result;
  const r = runnerUp.result;
  const margin = w.totalCents - r.totalCents;
  if (margin === 0) return `${winner.name} and ${runnerUp.name} are tied for your spending.`;
  const drivers = [
    { delta: w.rewardsCents - r.rewardsCents, text: "it earns more rewards on your spending" },
    { delta: w.creditsCents - r.creditsCents, text: "the credits you said you use are worth more" },
    { delta: w.bonusCents - r.bonusCents, text: "its sign-up bonus is worth more" },
    { delta: r.annualFeeCents - w.annualFeeCents, text: "its annual fee is lower" },
  ];
  const top = drivers.reduce((a, b) => (b.delta > a.delta ? b : a));
  return `${winner.name} wins by ${formatCentsWhole(margin)} a year over ${runnerUp.name}, mostly because ${top.text} (${formatCentsWhole(top.delta)} of the gap).`;
}

/** Runs every engine function the results page shows. Call with 2 to 4 cards. */
export function analyze(cards: CreditCard[], currencies: RewardCurrency[], state: CardsState) {
  const options = buildOptions(currencies, state);
  const baseline = flatRateCard();
  const baselineResult = annualValue(baseline, state.spend, options);
  const usage = Object.fromEntries(
    Object.entries(state.creditPercent).map(([id, p]) => [id, usageOf(p)]),
  ) as Record<string, CreditUsage>;
  const results = cards.map((card) => annualValue(card, state.spend, options));
  const totals = new Map([[baseline.id, baselineResult.totalCents]]);
  for (const r of results) totals.set(r.cardId, r.totalCents);

  const rows = cards.map((card, i) => {
    const others = [...cards.filter((c) => c.id !== card.id), baseline];
    const against = others.reduce((a, b) => ((totals.get(b.id) ?? 0) > (totals.get(a.id) ?? 0) ? b : a));
    return {
      card,
      result: results[i] as AnnualValueResult,
      effectiveFee: effectiveAnnualFee(card, usage),
      feasibility: signupBonusFeasibility(card, state.spend),
      feeBreakEven: breakEvenAnnualFee(card, state.spend, options, baseline),
      against,
      utilBreakEven:
        card.credits.length > 0 ? breakEvenCreditUtilization(card, against, state.spend, options) : null,
    };
  });

  const ranked = [...rows].sort((a, b) => b.result.totalCents - a.result.totalCents);
  const [first, second] = ranked;
  const winner =
    first && second
      ? {
          name: first.card.name,
          cardId: first.card.id,
          marginCents: first.result.totalCents - second.result.totalCents,
          reason: explainWin(
            { name: first.card.name, result: first.result },
            { name: second.card.name, result: second.result },
          ),
          baselineDeltaCents: first.result.totalCents - baselineResult.totalCents,
        }
      : null;

  const breakEvens = rows.flatMap((a, i) =>
    rows.slice(i + 1).map((b) => ({
      a: a.card,
      b: b.card,
      items: CATEGORIES.flatMap((category) =>
        breakEvenSpend(a.card, b.card, category, state.spend, options).crossings.map((x) => ({
          category,
          text: `${(x.winnerAbove === "a" ? a : b).card.name} beats ${(x.winnerBelow === "a" ? a : b).card.name} once you spend more than ${formatCentsWhole(x.monthlySpendCents)}/month on ${CATEGORY_LABELS[category].toLowerCase()}.`,
        })),
      ),
    })),
  );

  return {
    options,
    baseline,
    baselineResult,
    rows,
    ranked,
    winner,
    breakEvens,
    wallet: optimizeWallet(cards, state.spend, options),
  };
}

export type Analysis = ReturnType<typeof analyze>;
