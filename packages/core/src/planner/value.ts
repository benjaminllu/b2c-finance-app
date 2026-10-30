import { DAYS_PER_MONTH } from "../cards";
import type { BonusOffer, CreditCard } from "../types";

export interface OfferValue {
  /** Bonus in the offer's currency units (points, miles, or cents). */
  bonusUnits: number;
  centsPerPoint: number;
  bonusCents: number;
  /** First-year annual fee (0 when waived or not a card). */
  annualFeeCents: number;
  /** Monthly fees not waived by meeting the requirements, over the holding period. */
  monthlyFeesCents: number;
  /** Charged only when holding the account through the closure window would cost more in fees. */
  earlyClosureFeeCents: number;
  netCents: number;
  /** Days the account is assumed to stay open (deposit accounts close after this). */
  holdDays: number;
}

/** Days until every requirement window and holding period has passed. */
export function requirementDays(offer: BonusOffer): number {
  const r = offer.requirements;
  return Math.max(r.spendWindowDays ?? 0, r.directDepositWindowDays ?? 0, r.holdingPeriodDays ?? 0);
}

const monthsFor = (days: number) => Math.ceil(days / DAYS_PER_MONTH);

/**
 * Net value of one offer after fees, in integer cents (each line rounded once).
 * shortcut: local stand-in for @optima/core/offers offerNetValue, swap in once that module ships.
 */
export function plannerOfferValue(
  offer: BonusOffer,
  ctx: { card: Pick<CreditCard, "annualFeeCents" | "firstYearFeeWaived"> | null; centsPerPoint: number },
): OfferValue {
  const bonusCents = Math.round(offer.bonusValue * ctx.centsPerPoint);
  const annualFeeCents =
    offer.productType === "credit_card" && ctx.card && !ctx.card.firstYearFeeWaived
      ? ctx.card.annualFeeCents
      : 0;
  const monthlyFee = offer.monthlyFeeWaivedByRequirements ? 0 : offer.monthlyFeeCents;

  // Hold through the requirements, then either close (paying any early-closure fee) or keep the
  // account open through the closure window, whichever costs less.
  const baseDays = Math.max(requirementDays(offer), offer.productType === "credit_card" ? 0 : 1);
  const closeEarly =
    monthlyFee * monthsFor(baseDays) +
    (offer.earlyClosureWindowDays !== null && baseDays < offer.earlyClosureWindowDays
      ? offer.earlyClosureFeeCents
      : 0);
  const windowDays = Math.max(baseDays, offer.earlyClosureWindowDays ?? 0);
  const holdLonger = monthlyFee * monthsFor(windowDays);
  const keep = holdLonger <= closeEarly;

  const monthlyFeesCents = monthlyFee * monthsFor(keep ? windowDays : baseDays);
  const earlyClosureFeeCents = keep ? 0 : closeEarly - monthlyFeesCents;
  return {
    bonusUnits: offer.bonusValue,
    centsPerPoint: ctx.centsPerPoint,
    bonusCents,
    annualFeeCents,
    monthlyFeesCents,
    earlyClosureFeeCents,
    netCents: bonusCents - annualFeeCents - monthlyFeesCents - earlyClosureFeeCents,
    holdDays: keep ? windowDays : baseDays,
  };
}
