import { offerNetValue, requirementDays } from "../offers";
import type { BonusOffer, CreditCard } from "../types";

export { requirementDays };

export interface OfferValue {
  /** Bonus in the offer's currency units (points, miles, or cents). */
  bonusUnits: number;
  centsPerPoint: number;
  bonusCents: number;
  /** First-year annual fee (0 when waived or not a card). */
  annualFeeCents: number;
  /** Monthly fees not waived by meeting the requirements, over the days the account stays open. */
  monthlyFeesCents: number;
  /** Charged only when holding the account through the closure window would cost more in fees. */
  earlyClosureFeeCents: number;
  netCents: number;
  /** Days the account is assumed to stay open (deposit accounts close after this). */
  holdDays: number;
}

/** Planner view of offerNetValue (the one net-value implementation), flattened into fee lines. */
export function plannerOfferValue(
  offer: BonusOffer,
  ctx: { card: Pick<CreditCard, "annualFeeCents" | "firstYearFeeWaived"> | null; centsPerPoint: number },
): OfferValue {
  const v = offerNetValue(offer, {
    currencies: [{ id: offer.bonusCurrencyId, defaultCentsPerPoint: ctx.centsPerPoint }],
    cards: ctx.card && offer.cardId ? [{ id: offer.cardId, ...ctx.card }] : [],
  });
  const line = (key: string) => -(v.breakdown.find((l) => l.key === key)?.cents ?? 0);
  return {
    bonusUnits: offer.bonusValue,
    centsPerPoint: ctx.centsPerPoint,
    bonusCents: v.bonusCents,
    annualFeeCents: line("annual_fee"),
    monthlyFeesCents: line("monthly_fees"),
    earlyClosureFeeCents: line("early_closure_fee"),
    netCents: v.netCents,
    holdDays: v.keepOpenDays,
  };
}
