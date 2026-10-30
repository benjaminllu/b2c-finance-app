import { checkEligibility, type EligibilityContext, type EligibilityResult } from "../eligibility";
import type { BonusOffer, IsoDate } from "../types";

/** An offer with its computed values, the unit the filter and sort helpers work on. */
export interface OfferView {
  offer: BonusOffer;
  /** Gross bonus in cents (points valued). */
  bonusCents: number;
  netCents: number;
  /** Null when there is no eligibility check or the offer is fine. */
  eligibility?: EligibilityResult;
}

export interface OfferFilters {
  tab: "cards" | "bank";
  minBonusCents?: number;
  maxMinSpendCents?: number;
  /** "no": needs no direct deposit; "yes": requires one; "any": ignore. */
  directDeposit?: "any" | "yes" | "no";
  state?: string;
  institutionId?: string;
  expiringSoon?: boolean;
  hideIneligible?: boolean;
}

export const EXPIRING_SOON_DAYS = 14;

const DAY_MS = 86_400_000;
/** Whole days from `today` to `date` (negative when past). */
export const daysUntil = (date: IsoDate, today: IsoDate): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

/** An offer is live through its expiresAt date. */
export const isExpired = (o: BonusOffer, today: IsoDate): boolean =>
  o.expiresAt !== null && o.expiresAt < today;

export const requiresDirectDeposit = (o: BonusOffer): boolean =>
  o.requirements.directDepositTotalCents !== null || o.requirements.directDepositCount !== null;

/** Applies the filters. Expired offers are always dropped. Never reads affiliate fields. */
export function filterOffers(views: readonly OfferView[], f: OfferFilters, today: IsoDate): OfferView[] {
  return views.filter(({ offer: o, bonusCents, eligibility }) => {
    if (isExpired(o, today)) return false;
    if ((o.productType === "credit_card") !== (f.tab === "cards")) return false;
    if (f.minBonusCents !== undefined && bonusCents < f.minBonusCents) return false;
    if (f.maxMinSpendCents !== undefined && (o.requirements.minSpendCents ?? 0) > f.maxMinSpendCents)
      return false;
    if (f.directDeposit === "yes" && !requiresDirectDeposit(o)) return false;
    if (f.directDeposit === "no" && requiresDirectDeposit(o)) return false;
    if (f.state && o.eligibleStates !== null && !o.eligibleStates.includes(f.state)) return false;
    if (f.institutionId && o.institutionId !== f.institutionId) return false;
    if (f.expiringSoon && (o.expiresAt === null || daysUntil(o.expiresAt, today) > EXPIRING_SOON_DAYS))
      return false;
    if (f.hideIneligible && eligibility && !eligibility.eligible) return false;
    return true;
  });
}

/**
 * Return on the capital the offer needs: net / (cash parked for bank offers, required spend for cards), in bps.
 * Null when it needs neither (ROI undefined; sorts last).
 */
export function offerRoiBps(o: BonusOffer, netCents: number): number | null {
  const r = o.requirements;
  const capital =
    o.productType === "credit_card"
      ? (r.minSpendCents ?? 0)
      : Math.max(r.minDepositCents ?? 0, r.minBalanceCents ?? 0);
  return capital > 0 ? Math.round((netCents / capital) * 10_000) : null;
}

export type OfferSortKey = "net" | "deadline" | "roi";

/** Sorted copy. net: high first. deadline: soonest first, no expiry last. roi: high first, undefined last. Ties by id. */
export function sortOffers(views: readonly OfferView[], key: OfferSortKey): OfferView[] {
  const n = (v: number | null, desc: boolean) => (v === null ? Infinity : desc ? -v : v);
  const k = (v: OfferView): number =>
    key === "net"
      ? -v.netCents
      : key === "deadline"
        ? n(v.offer.expiresAt === null ? null : Date.parse(v.offer.expiresAt), false)
        : n(offerRoiBps(v.offer, v.netCents), true);
  return [...views].sort((a, b) => {
    const d = k(a) - k(b);
    return d !== 0 && !Number.isNaN(d) ? d : a.offer.id.localeCompare(b.offer.id);
  });
}

/** Eligibility per offer id, using the shared evaluator. */
export function eligibilityByOffer(
  offers: readonly BonusOffer[],
  ctx: EligibilityContext,
): Map<string, EligibilityResult> {
  return new Map(offers.map((o) => [o.id, checkEligibility(o, ctx)]));
}
