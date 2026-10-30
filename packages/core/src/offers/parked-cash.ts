import { effectiveApy } from "../banking/effective-apy";
import type { BonusOffer, DepositProduct } from "../types";

export interface ParkedCashComparison {
  cashCents: number;
  days: number;
  /** Net dollars the bonus earns over the period (bonus + interest - fees). */
  bonusEarningsCents: number;
  bonusApyBps: number;
  /** Best savings/money-market product for the same cash and period; null if none qualifies. */
  alternative: { productId: string; name: string; apyBps: number; earningsCents: number } | null;
  summary: string;
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/**
 * For cash bonuses that tie up money: the bonus's effective APY (via effectiveApy) next to the best plain
 * savings option for the same cash and days. Null when the offer needs no parked cash or is not cash-paid.
 */
export function parkedCashComparison(
  offer: BonusOffer,
  linkedProduct: DepositProduct | null,
  products: readonly DepositProduct[],
): ParkedCashComparison | null {
  const r = offer.requirements;
  const cash = Math.max(r.minDepositCents ?? 0, r.minBalanceCents ?? 0);
  if (cash <= 0) return null;
  const days = r.holdingPeriodDays ?? offer.earlyClosureWindowDays ?? 30;
  const bonus = effectiveApy(
    { kind: "bonus", offer, product: linkedProduct },
    { principalCents: cash, horizonDays: days },
  );
  if (!bonus.feasible || bonus.effectiveApyBps === null) return null;

  let alternative: ParkedCashComparison["alternative"] = null;
  for (const p of [...products].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.type !== "savings" && p.type !== "money_market") continue;
    const res = effectiveApy({ kind: "deposit", product: p }, { principalCents: cash, horizonDays: days });
    if (!res.feasible || res.effectiveApyBps === null) continue;
    if (!alternative || res.effectiveApyBps > alternative.apyBps) {
      alternative = {
        productId: p.id,
        name: p.name,
        apyBps: res.effectiveApyBps,
        earningsCents: res.netEarningsCents,
      };
    }
  }
  const head = `This bonus earns the equivalent of ${pct(bonus.effectiveApyBps)} APY on ${usd(cash)} for ${days} days (${usd(bonus.netEarningsCents)} net)`;
  const summary = alternative
    ? `${head} vs ${pct(alternative.apyBps)} at the best savings account (${alternative.name}), which earns ${usd(alternative.earningsCents)} on the same cash.`
    : `${head}. No savings account in the database fits that amount for comparison.`;
  return {
    cashCents: cash,
    days,
    bonusEarningsCents: bonus.netEarningsCents,
    bonusApyBps: bonus.effectiveApyBps,
    alternative,
    summary,
  };
}
