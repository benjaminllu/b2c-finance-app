import { CATEGORIES, emptySpendProfile } from "../types";
import type { Category, CreditCard, SpendProfile } from "../types";
import {
  annualValue,
  capOf,
  centsPerPointFor,
  evaluateMonths,
  roundValue,
  ruleTable,
  type AnnualValueResult,
  type ValuationOptions,
} from "./engine";

export interface WalletSplit {
  cardId: string;
  annualSpendCents: number;
  /** Share of the category's annual spend (0-1). */
  share: number;
}

export interface WalletAssignment {
  category: Category;
  annualSpendCents: number;
  /** Card carrying most of this category's spend; null when there is no spend. */
  primaryCardId: string | null;
  /** Cards used for this category, largest share first. More than one when a cap overflows. */
  splits: WalletSplit[];
}

export interface WalletResult {
  assignments: WalletAssignment[];
  /** Each card valued on the spend routed to it; its fee, credits (and first-year bonus) counted once. */
  cards: AnnualValueResult[];
  /** Sum of cards[].totalCents. */
  totalNetCents: number;
  /** Each card's value if it carried all spend alone. */
  singleCard: { cardId: string; totalCents: number }[];
  bestSingleCardId: string;
  /** totalNetCents minus the best single card's total. */
  gainOverBestSingleCents: number;
}

/**
 * Route every purchase in a 1-4 card wallet to the card that earns the most on it. Month by month, each
 * category goes to the card with the highest cents per dollar; once that card's cap is used up, the
 * rest overflows to the next best card.
 * shortcut: greedy, not a global optimum. Categories are filled in CATEGORIES order within a month (so a
 * shared cap goes to the earlier category) and caps fill in calendar order; spend is not steered toward
 * meeting a sign-up bonus minimum. Upgrade to an LP if wallets with competing shared caps matter.
 */
export function optimizeWallet(
  cards: readonly CreditCard[],
  spendProfile: SpendProfile,
  options: ValuationOptions,
): WalletResult {
  if (cards.length < 1 || cards.length > 4)
    throw new RangeError(`optimizeWallet takes 1 to 4 cards, got ${cards.length}`);
  if (new Set(cards.map((c) => c.id)).size !== cards.length)
    throw new Error("optimizeWallet: duplicate card ids");

  const tables = cards.map((c) => ruleTable(c, options.includePortalOnly ?? false));
  const cpps = cards.map((c) => centsPerPointFor(c.rewardCurrencyId, options));
  const capUsed = cards.map(() => new Map<string, number>());
  const routed = cards.map(() => Array.from({ length: 12 }, () => emptySpendProfile()));

  for (let month = 0; month < 12; month++) {
    for (const category of CATEGORIES) {
      let remaining = spendProfile[category];
      while (remaining > 0) {
        let best = 0;
        let bestRate = -Infinity;
        let bestRoom = Infinity;
        let bestBucket: string | null = null;
        for (const [i, card] of cards.entries()) {
          const rule = tables[i]?.[month]?.[category] ?? null;
          let multiplier = rule ? rule.multiplier : card.baseMultiplier;
          let room = Infinity;
          const cap = rule ? capOf(card, rule, month) : null;
          const bucket = cap?.key ?? null;
          if (rule && cap) {
            room = cap.capCents - (capUsed[i]?.get(cap.key) ?? 0);
            if (room <= 0) {
              multiplier = rule.afterCapMultiplier ?? card.baseMultiplier;
              room = Infinity;
            }
          }
          const rate = multiplier * (cpps[i] ?? 0);
          if (rate > bestRate) {
            best = i;
            bestRate = rate;
            bestRoom = room;
            bestBucket = room === Infinity ? null : bucket;
          }
        }
        const amount = Math.min(remaining, bestRoom);
        const cell = routed[best]?.[month];
        if (cell) cell[category] += amount;
        if (bestBucket) capUsed[best]?.set(bestBucket, (capUsed[best]?.get(bestBucket) ?? 0) + amount);
        remaining -= amount;
      }
    }
  }

  const view = options.view ?? "ongoing";
  const valued = cards.map((card, i) =>
    roundValue(card, evaluateMonths(card, routed[i] ?? [], options), view),
  );
  const assignments = CATEGORIES.map((category) => {
    const annualSpendCents = spendProfile[category] * 12;
    const splits = valued
      .map((v) => {
        const spend = v.categories.find((c) => c.category === category)?.annualSpendCents ?? 0;
        return {
          cardId: v.cardId,
          annualSpendCents: spend,
          share: annualSpendCents > 0 ? spend / annualSpendCents : 0,
        };
      })
      .filter((s) => s.annualSpendCents > 0)
      .sort((a, b) => b.annualSpendCents - a.annualSpendCents);
    return { category, annualSpendCents, primaryCardId: splits[0]?.cardId ?? null, splits };
  });

  const totalNetCents = valued.reduce((s, v) => s + v.totalCents, 0);
  const singleCard = cards.map((card) => ({
    cardId: card.id,
    totalCents: annualValue(card, spendProfile, options).totalCents,
  }));
  const bestSingle = singleCard.reduce((a, b) => (b.totalCents > a.totalCents ? b : a));
  return {
    assignments,
    cards: valued,
    totalNetCents,
    singleCard,
    bestSingleCardId: bestSingle.cardId,
    gainOverBestSingleCents: totalNetCents - bestSingle.totalCents,
  };
}
