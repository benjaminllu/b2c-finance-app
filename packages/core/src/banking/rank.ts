import type { BonusOffer, DepositProduct, FeeWaiver } from "../types";
import { effectiveApy, infeasibleResult, type EffectiveApyResult } from "./effective-apy";

export interface RankedOption {
  /** product id, or offer id for bonuses. */
  id: string;
  kind: "deposit" | "bonus";
  product: DepositProduct | null;
  offer: BonusOffer | null;
  result: EffectiveApyResult;
}

export interface RankResult {
  /** Feasible options, best net dollars first. */
  ranked: RankedOption[];
  /** Infeasible or expired options, with the reason in result.infeasibleReason. */
  excluded: RankedOption[];
}

/**
 * Ranks deposit products and open bank bonuses by net dollars over the lock-up, then effective APY.
 * Never reads affiliate fields.
 */
export function rankCashOptions(input: {
  products: DepositProduct[];
  offers: BonusOffer[];
  amountCents: number;
  horizonDays: number;
  /** For offer expiry; defaults to now. */
  now?: Date;
  metWaivers?: readonly FeeWaiver["kind"][];
}): RankResult {
  const { amountCents, horizonDays, metWaivers } = input;
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const all: RankedOption[] = input.products.map((product) => ({
    id: product.id,
    kind: "deposit",
    product,
    offer: null,
    result: effectiveApy(
      { kind: "deposit", product },
      { principalCents: amountCents, horizonDays, metWaivers },
    ),
  }));
  // Bonus ranking assumes cash above the bonus's requirement sits in the best feasible savings/MM account.
  const sweep =
    all
      .filter(
        (o) => o.result.feasible && (o.product?.type === "savings" || o.product?.type === "money_market"),
      )
      .sort((a, b) => b.result.netEarningsCents - a.result.netEarningsCents || a.id.localeCompare(b.id))[0]
      ?.product ?? null;
  for (const offer of input.offers) {
    if (offer.productType === "credit_card") continue;
    const product = offer.depositProductId ? (byId.get(offer.depositProductId) ?? null) : null;
    const expired = offer.expiresAt !== null && offer.expiresAt < today;
    all.push({
      id: offer.id,
      kind: "bonus",
      product,
      offer,
      result: expired
        ? infeasibleResult(`This offer expired on ${offer.expiresAt}.`)
        : effectiveApy(
            { kind: "bonus", offer, product },
            { principalCents: amountCents, horizonDays, excessCashProduct: sweep },
          ),
    });
  }
  const apy = (o: RankedOption) => o.result.effectiveApyBps ?? -1;
  const ranked = all
    .filter((o) => o.result.feasible)
    .sort(
      (a, b) =>
        b.result.netEarningsCents - a.result.netEarningsCents || apy(b) - apy(a) || a.id.localeCompare(b.id),
    );
  return { ranked, excluded: all.filter((o) => !o.result.feasible) };
}
