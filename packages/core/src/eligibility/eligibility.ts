import type {
  AccountRecord,
  BonusOffer,
  CreditCard,
  EligibilityRule,
  EligibilityRuleKind,
  IsoDate,
} from "../types";

export interface EligibilityIssue {
  /** Rule id, or null for terms on the offer itself. */
  ruleId: string | null;
  kind: EligibilityRuleKind | "offer_lifetime" | "offer_lookback";
  reason: string;
  /** First date the issue clears, or null if it never clears on its own (e.g. lifetime, or close an account first). */
  eligibleFrom: IsoDate | null;
}

export interface EligibilityResult {
  eligible: boolean;
  issues: EligibilityIssue[];
  /** asOf when eligible; the latest eligibleFrom across issues; null if any issue never clears on its own. */
  eligibleFrom: IsoDate | null;
}

export interface EligibilityContext {
  rules: readonly EligibilityRule[];
  /** The user's accounts. Records opened after asOf are ignored, so planners can pass hypothetical history. */
  history: readonly AccountRecord[];
  asOf: IsoDate;
  /** Used to resolve a card offer's product family. */
  cards?: readonly Pick<CreditCard, "id" | "productFamily">[];
}

/** Adds calendar months to a YYYY-MM-DD date, clamping to the month's last day. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/** Bonus date for lookbacks; when unknown we assume the bonus was earned at opening (conservative). */
const bonusDate = (a: AccountRecord) => a.bonusReceivedAt ?? a.openedAt;

/**
 * Checks one offer against institution rules (rules.json) and the offer's own eligibility terms.
 * "Likely ineligible" heuristics only: issuers do not publish all rules, so reasons say what was assumed.
 */
export function checkEligibility(offer: BonusOffer, ctx: EligibilityContext): EligibilityResult {
  const { asOf } = ctx;
  const history = ctx.history.filter((a) => a.openedAt <= asOf);
  const productId = offer.cardId ?? offer.depositProductId;
  const family = offer.cardId ? (ctx.cards?.find((c) => c.id === offer.cardId)?.productFamily ?? null) : null;
  const isOpen = (a: AccountRecord) => a.closedAt === null || a.closedAt > asOf;

  const sameProduct = (a: AccountRecord) => productId !== null && a.productId === productId;
  const sameFamily = (a: AccountRecord) => sameProduct(a) || (family !== null && a.productFamily === family);
  const matchesScope = (a: AccountRecord, scope: "product" | "product_family" | "institution") =>
    scope === "product" ? sameProduct(a) : scope === "product_family" ? sameFamily(a) : true;

  const issues: EligibilityIssue[] = [];

  for (const rule of ctx.rules) {
    if (!rule.appliesTo.institutionIds.includes(offer.institutionId)) continue;
    if (!rule.appliesTo.productTypes.includes(offer.productType)) continue;
    const atInstitution = (a: AccountRecord) =>
      a.institutionId === offer.institutionId && rule.appliesTo.productTypes.includes(a.productType);

    switch (rule.kind) {
      case "max_new_accounts": {
        const counted = history
          .filter(
            (a) =>
              rule.countedProductTypes.includes(a.productType) &&
              (rule.countBusiness || !a.isBusiness) &&
              (rule.countScope === "all_institutions" || a.institutionId === offer.institutionId) &&
              addMonths(a.openedAt, rule.windowMonths) > asOf,
          )
          .map((a) => a.openedAt)
          .sort();
        if (counted.length >= rule.count) {
          // The (n - count + 1)th oldest account must age out of the window.
          const ageOut = counted[counted.length - rule.count] as IsoDate;
          issues.push({
            ruleId: rule.id,
            kind: rule.kind,
            reason: `${rule.name}: ${counted.length} counted accounts opened in the last ${rule.windowMonths} months (limit is under ${rule.count}).`,
            eligibleFrom: addMonths(ageOut, rule.windowMonths),
          });
        }
        break;
      }
      case "min_days_between_apps": {
        const last = history
          .filter(atInstitution)
          .map((a) => a.openedAt)
          .sort()
          .at(-1);
        if (last && addDays(last, rule.days) > asOf) {
          issues.push({
            ruleId: rule.id,
            kind: rule.kind,
            reason: `${rule.name}: last opened ${last}; wait ${rule.days} days between applications.`,
            eligibleFrom: addDays(last, rule.days),
          });
        }
        break;
      }
      case "lifetime_bonus": {
        const prior = history.find((a) => atInstitution(a) && matchesScope(a, rule.productScope));
        if (prior) {
          issues.push({
            ruleId: rule.id,
            kind: rule.kind,
            reason: `${rule.name}: you opened ${prior.name} on ${prior.openedAt}; this bonus is once per lifetime (assuming you received it).`,
            eligibleFrom: null,
          });
        }
        break;
      }
      case "bonus_lookback": {
        for (const a of history.filter((x) => atInstitution(x) && matchesScope(x, rule.productScope))) {
          if (rule.measureFrom === "account_closed" && a.closedAt === null) {
            issues.push({
              ruleId: rule.id,
              kind: rule.kind,
              reason: `${rule.name}: ${a.name} is still open; the ${rule.months}-month clock starts when it closes.`,
              eligibleFrom: null,
            });
            continue;
          }
          const from =
            rule.measureFrom === "account_closed"
              ? (a.closedAt as IsoDate)
              : rule.measureFrom === "account_opened"
                ? a.openedAt
                : bonusDate(a);
          const clears = addMonths(from, rule.months);
          if (clears > asOf) {
            issues.push({
              ruleId: rule.id,
              kind: rule.kind,
              reason: `${rule.name}: ${a.name} (${rule.measureFrom.replace("_", " ")} ${from}) is within the ${rule.months}-month lookback.`,
              eligibleFrom: clears,
            });
          }
        }
        break;
      }
      case "max_open_accounts": {
        const open = history.filter((a) => atInstitution(a) && isOpen(a));
        if (open.length >= rule.count) {
          issues.push({
            ruleId: rule.id,
            kind: rule.kind,
            reason: `${rule.name}: ${open.length} open accounts (limit ${rule.count}); close one first.`,
            eligibleFrom: null,
          });
        }
        break;
      }
      default: {
        const _exhaustive: never = rule;
        return _exhaustive;
      }
    }
  }

  // The offer's own terms. Institution scope counts the same product type at the same institution.
  const { eligibility } = offer;
  const offerScope = (a: AccountRecord) =>
    a.institutionId === offer.institutionId &&
    a.productType === offer.productType &&
    matchesScope(a, eligibility.lookbackScope);

  if (eligibility.lifetimeLimit) {
    const prior = history.find((a) => a.institutionId === offer.institutionId && sameProduct(a));
    if (prior) {
      issues.push({
        ruleId: null,
        kind: "offer_lifetime",
        reason: `Once-per-lifetime offer and you opened ${prior.name} on ${prior.openedAt}.`,
        eligibleFrom: null,
      });
    }
  }
  if (eligibility.lookbackMonths !== null) {
    for (const a of history.filter(offerScope)) {
      const clears = addMonths(bonusDate(a), eligibility.lookbackMonths);
      if (clears > asOf) {
        issues.push({
          ruleId: null,
          kind: "offer_lookback",
          reason: `Offer excludes anyone who got a bonus on a matching ${eligibility.lookbackScope.replace("_", " ")} in the last ${eligibility.lookbackMonths} months (${a.name}, ${bonusDate(a)}).`,
          eligibleFrom: clears,
        });
      }
    }
  }

  if (issues.length === 0) return { eligible: true, issues, eligibleFrom: asOf };
  const never = issues.some((i) => i.eligibleFrom === null);
  return {
    eligible: false,
    issues,
    eligibleFrom: never ? null : issues.reduce((d, i) => maxDate(d, i.eligibleFrom as IsoDate), asOf),
  };
}
