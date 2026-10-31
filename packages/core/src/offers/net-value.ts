import { DAYS_PER_MONTH } from "../banking/interest";
import type { BonusOffer, CreditCard, RewardCurrency } from "../types";

export interface NetValueContext {
  currencies: readonly Pick<RewardCurrency, "id" | "defaultCentsPerPoint">[];
  /** User overrides: currencyId -> cents per point. Beat the currency default. */
  centsPerPoint?: Readonly<Record<string, number>>;
  /** Needed for card offers' first-year annual fee. */
  cards?: readonly Pick<CreditCard, "id" | "annualFeeCents" | "firstYearFeeWaived">[];
  /** Days the account stays open. Default: the cheaper of closing after the requirements or holding past the closure window. */
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
  /** Days the account is assumed to stay open (0 for card offers). */
  keepOpenDays: number;
}

const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Days until every requirement window and holding period has passed. */
export function requirementDays(offer: BonusOffer): number {
  const r = offer.requirements;
  return Math.max(r.spendWindowDays ?? 0, r.directDepositWindowDays ?? 0, r.holdingPeriodDays ?? 0);
}

/** Days the offer's terms require the account to stay open, before fee-free closure. 0 if no terms. */
export function requiredOpenDays(offer: BonusOffer): number {
  return Math.max(offer.requirements.holdingPeriodDays ?? 0, offer.earlyClosureWindowDays ?? 0);
}

/** Monthly fees are charged per statement month started, so a partial month counts (conservative). */
const feeMonths = (days: number) => Math.ceil(days / DAYS_PER_MONTH - 1e-9);

/**
 * Default days a deposit account stays open: through the requirements and bonus posting, then either close (paying any
 * early-closure fee) or keep it open through the closure window, whichever costs less.
 */
function defaultKeepOpenDays(offer: BonusOffer): number {
  const fee = offer.monthlyFeeWaivedByRequirements ? 0 : offer.monthlyFeeCents;
  // Most banks only pay a bonus into an open account, so hold it until the bonus posts.
  const base = Math.max(requirementDays(offer) + (offer.bonusPostingDays ?? 0), 1);
  const win = offer.earlyClosureWindowDays ?? 0;
  const closeEarly = fee * feeMonths(base) + (base < win ? offer.earlyClosureFeeCents : 0);
  const holdLonger = fee * feeMonths(Math.max(base, win));
  return holdLonger <= closeEarly ? Math.max(base, win) : base;
}

/**
 * Effective net value of an offer in cents. The single source of truth for offer value: the offers feed and
 * the planner both use it.
 *   bonus (cash, or points x cents-per-point)
 *   - monthly fees not waived by the requirements, for each statement month the account is open
 *   - early-closure fee, only if keepOpenDays is shorter than the closure window
 *   - first-year annual fee for card offers, unless waived.
 * Never reads affiliate fields.
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

  let keepDays = 0;
  if (offer.productType !== "credit_card") {
    keepDays = ctx.keepOpenDays ?? defaultKeepOpenDays(offer);
    const months = feeMonths(keepDays);
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
        explanation.push(
          `Closing on day ${keepDays}, before day ${win}, costs ${usd(offer.earlyClosureFeeCents)}${ctx.keepOpenDays === undefined ? ", which is cheaper than paying monthly fees until then" : ""}.`,
        );
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
  return { netCents, bonusCents, breakdown, explanation, keepOpenDays: keepDays };
}
