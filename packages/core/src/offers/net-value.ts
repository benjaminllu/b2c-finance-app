import { DAYS_PER_MONTH } from "../banking/interest";
import type { BonusOffer, CreditCard, RewardCurrency } from "../types";

export interface NetValueContext {
  currencies: readonly Pick<RewardCurrency, "id" | "defaultCentsPerPoint">[];
  /** User overrides: currencyId -> cents per point. Beat the currency default. */
  centsPerPoint?: Readonly<Record<string, number>>;
  /** Needed for card offers' first-year annual fee. */
  cards?: readonly Pick<CreditCard, "id" | "annualFeeCents" | "firstYearFeeWaived">[];
  /** Days the account stays open. Default: max(holding period, early-closure window). */
  keepOpenDays?: number;
}

export interface NetValueLine {
  key: "bonus" | "monthly_fees" | "early_closure_fee" | "annual_fee";
  label: string;
  /** Signed cents: income positive, costs negative. */
  cents: number;
}

export interface OfferNetValue {
  /** Sum of breakdown. */
  netCents: number;
  /** Bonus converted to cents (before costs). */
  bonusCents: number;
  breakdown: NetValueLine[];
  explanation: string[];
}

const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Days the offer's terms require the account to stay open, before fee-free closure. 0 if no terms. */
export function requiredOpenDays(offer: BonusOffer): number {
  return Math.max(offer.requirements.holdingPeriodDays ?? 0, offer.earlyClosureWindowDays ?? 0);
}

/**
 * Effective net value of an offer in cents:
 *   bonus (cash, or points x cents-per-point)
 *   - monthly fees not waived by the requirements, for each full month the account stays open
 *   - early-closure fee, only if keepOpenDays is shorter than the closure window
 *   - first-year annual fee for card offers, unless waived.
 *
 * Choices: the user must keep a bank account open for max(holding period, early-closure window) to take the
 * bonus without a closure fee, so monthly fees accrue over that span (default keepOpenDays). With the default the
 * closure fee never applies; pass a shorter keepOpenDays to see the risk. Never reads affiliate fields.
 */
export function offerNetValue(offer: BonusOffer, ctx: NetValueContext): OfferNetValue {
  const breakdown: NetValueLine[] = [];
  const explanation: string[] = [];

  let bonusCents: number;
  if (offer.bonusCurrencyId === "usd") {
    bonusCents = offer.bonusValue;
    explanation.push(`Bonus: ${usd(bonusCents)} cash.`);
  } else {
    const override = ctx.centsPerPoint?.[offer.bonusCurrencyId];
    const cur = ctx.currencies.find((c) => c.id === offer.bonusCurrencyId);
    const cpp = override ?? cur?.defaultCentsPerPoint;
    if (cpp === undefined) {
      bonusCents = 0;
      explanation.push(
        `Bonus: ${offer.bonusValue.toLocaleString("en-US")} points, but "${offer.bonusCurrencyId}" has no known value, so they count as $0.00.`,
      );
    } else {
      bonusCents = Math.round(offer.bonusValue * cpp);
      explanation.push(
        `Bonus: ${offer.bonusValue.toLocaleString("en-US")} points x ${cpp} cents each = ${usd(bonusCents)}${override !== undefined ? " (your value)" : ""}.`,
      );
    }
  }
  breakdown.push({ key: "bonus", label: "Sign-up bonus", cents: bonusCents });

  if (offer.productType !== "credit_card") {
    const keepDays = ctx.keepOpenDays ?? requiredOpenDays(offer);
    const months = Math.floor(keepDays / DAYS_PER_MONTH + 1e-9);
    if (offer.monthlyFeeCents > 0) {
      if (offer.monthlyFeeWaivedByRequirements) {
        explanation.push(
          `The ${usd(offer.monthlyFeeCents)} monthly fee is waived when you meet the requirements.`,
        );
      } else if (months > 0) {
        const fees = offer.monthlyFeeCents * months;
        breakdown.push({ key: "monthly_fees", label: "Monthly fees not waived", cents: -fees });
        explanation.push(
          `The ${usd(offer.monthlyFeeCents)} monthly fee is not waived; ${months} month${months === 1 ? "" : "s"} open = ${usd(-fees)}.`,
        );
      }
    }
    const win = offer.earlyClosureWindowDays;
    if (offer.earlyClosureFeeCents > 0 && win !== null) {
      if (keepDays < win) {
        breakdown.push({
          key: "early_closure_fee",
          label: "Early closure fee",
          cents: -offer.earlyClosureFeeCents,
        });
        explanation.push(`Closing before day ${win} costs ${usd(offer.earlyClosureFeeCents)}.`);
      } else {
        explanation.push(
          `Assumes you keep the account open ${keepDays} days, past the ${win}-day window, so the ${usd(offer.earlyClosureFeeCents)} closure fee is avoided.`,
        );
      }
    }
  } else {
    const card = ctx.cards?.find((c) => c.id === offer.cardId);
    if (!card) {
      explanation.push("Card details not found, so the annual fee is not counted.");
    } else if (card.annualFeeCents > 0) {
      if (card.firstYearFeeWaived) {
        explanation.push(`The ${usd(card.annualFeeCents)} annual fee is waived the first year.`);
      } else {
        breakdown.push({ key: "annual_fee", label: "First-year annual fee", cents: -card.annualFeeCents });
        explanation.push(`First-year annual fee: ${usd(-card.annualFeeCents)}.`);
      }
    }
  }

  const netCents = breakdown.reduce((s, l) => s + l.cents, 0);
  explanation.push(`Net value: ${usd(netCents)}.`);
  return { netCents, bonusCents, breakdown, explanation };
}
