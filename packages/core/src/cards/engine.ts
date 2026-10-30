/**
 * Card value engine.
 *
 * Rounding: everything is computed in fractional cents. Each output line item (one category, one credit,
 * the bonus, the fee) is rounded once with Math.round, and every total is the sum of its rounded lines,
 * so tables always add up. Solvers (break-evens, winner flips) work on the unrounded values.
 *
 * Time model: a year is 12 months starting in January (months 1-3 are Q1). A SpendProfile is repeated
 * for every month. Monthly caps apply per month, quarterly caps per calendar quarter, annual caps once.
 * shortcut: the first card year is treated as a calendar year (no anniversary offset), upgrade if the
 * planner needs month-of-opening precision.
 */
import { CATEGORIES } from "../types";
import type { CardCredit, Category, CreditCard, EarnRule, RewardCurrency, SpendProfile } from "../types";

export type ValuationView = "ongoing" | "first_year";

/**
 * Share of a credit's face value assumed used when the user has not said. Zero: Optima never assumes
 * you will use a credit; the UI asks, and the user opts in per credit.
 */
export const DEFAULT_CREDIT_UTILIZATION = 0;

/** Days per month used to turn monthly spend into daily spend (365 / 12). */
export const DAYS_PER_MONTH = 365 / 12;

export interface ValuationOptions {
  /** Currencies used to value points. "usd" is worth 1 cent when absent. */
  currencies: readonly RewardCurrency[];
  /** User cents-per-point overrides by currency id; otherwise the currency's defaultCentsPerPoint. */
  centsPerPoint?: Readonly<Record<string, number>>;
  /** Expected share (0 to 1) of each credit the user will use, by credit id. */
  creditUtilization?: Readonly<Record<string, number>>;
  /** Utilization for credits missing from creditUtilization. Defaults to DEFAULT_CREDIT_UTILIZATION. */
  defaultCreditUtilization?: number;
  /** Count portalOnly earn rules (assume that category is booked through the issuer portal). Default false. */
  includePortalOnly?: boolean;
  /** "first_year" adds the sign-up bonus and applies firstYearFeeWaived. Default "ongoing". */
  view?: ValuationView;
}

export interface CategoryValue {
  category: Category;
  annualSpendCents: number;
  /** Reward units earned in the card's currency, rounded to whole units for display. */
  points: number;
  valueCents: number;
  /** valueCents / annualSpendCents in basis points (200 = 2%); 0 when there is no spend. */
  effectiveRateBps: number;
  /** The highest-multiplier earn rule used for this category in any month; null = base rate only. */
  earnRule: EarnRule | null;
  capHit: boolean;
  /** Annual spend that earned the after-cap rate because a cap was reached. */
  spendAboveCapCents: number;
}

export interface CreditValue {
  creditId: string;
  name: string;
  faceValueCents: number;
  utilization: number;
  valueCents: number;
}

export interface SignupBonusValue {
  amount: number;
  currencyId: string;
  centsPerPoint: number;
  valueCents: number;
  /** Whether this spend pattern reaches the minimum spend inside the window (see signupBonusFeasibility). */
  feasible: boolean;
}

export interface AnnualValueResult {
  cardId: string;
  view: ValuationView;
  currencyId: string;
  centsPerPoint: number;
  /** One line per canonical category, in CATEGORIES order. */
  categories: CategoryValue[];
  credits: CreditValue[];
  /** First-year view only, and only when the card has a bonus. Counted even when not feasible. */
  signupBonus: SignupBonusValue | null;
  /** Fee charged in this view (0 in the first year when waived). */
  annualFeeCents: number;
  annualSpendCents: number;
  rewardsCents: number;
  creditsCents: number;
  bonusCents: number;
  /** rewardsCents + creditsCents + bonusCents - annualFeeCents. */
  totalCents: number;
}

/** Unrounded engine output; `net` is the exact fractional-cent total used by solvers. */
export interface RawValue {
  categories: {
    category: Category;
    spend: number;
    points: number;
    value: number;
    earnRule: EarnRule | null;
    aboveCap: number;
  }[];
  credits: { credit: CardCredit; utilization: number; value: number }[];
  bonus: { amount: number; currencyId: string; cpp: number; value: number; feasible: boolean } | null;
  fee: number;
  cpp: number;
  net: number;
}

export function centsPerPointFor(currencyId: string, opts: ValuationOptions): number {
  const override = opts.centsPerPoint?.[currencyId];
  if (override !== undefined) return override;
  const currency = opts.currencies.find((c) => c.id === currencyId);
  if (currency) return currency.defaultCentsPerPoint;
  if (currencyId === "usd") return 1;
  throw new Error(`Unknown reward currency "${currencyId}": pass it in options.currencies`);
}

function utilizationFor(creditId: string, opts: ValuationOptions): number {
  const u = opts.creditUtilization?.[creditId] ?? opts.defaultCreditUtilization ?? DEFAULT_CREDIT_UTILIZATION;
  if (!(u >= 0 && u <= 1))
    throw new RangeError(`Credit utilization for "${creditId}" must be 0 to 1, got ${u}`);
  return u;
}

/** rules[month][category]: the rule that earns in that month, or null for the base rate. */
export function ruleTable(card: CreditCard, includePortalOnly: boolean): Record<Category, EarnRule | null>[] {
  return Array.from({ length: 12 }, (_, month) => {
    const quarter = Math.floor(month / 3) + 1;
    const row = {} as Record<Category, EarnRule | null>;
    for (const category of CATEGORIES) {
      let best: EarnRule | null = null;
      for (const r of card.earnRules) {
        if (r.category !== category || (r.portalOnly && !includePortalOnly)) continue;
        if (r.activeQuarters && !r.activeQuarters.some((q) => q === quarter)) continue;
        // shortcut: when several rules match, the highest multiplier wins and its after-cap rate applies
        // (no cascade to the next rule); fine for real cards, upgrade if a card stacks capped rules.
        if (!best || r.multiplier > best.multiplier) best = r;
      }
      row[category] = best;
    }
    return row;
  });
}

/**
 * Cap bucket a capped rule's spend counts against in a month: shared by capGroup, one per period.
 * shortcut: rules in one capGroup are assumed to share capAmountCents/capPeriod; the rule in hand is used.
 */
export function capBucket(card: CreditCard, rule: EarnRule, month: number): string | null {
  if (rule.capAmountCents === null || rule.capPeriod === null) return null;
  const group = rule.capGroup ?? `#${card.earnRules.indexOf(rule)}`;
  const period =
    rule.capPeriod === "monthly" ? month : rule.capPeriod === "quarterly" ? Math.floor(month / 3) : 0;
  return `${group}|${period}`;
}

export function monthsOf(profile: SpendProfile): SpendProfile[] {
  return Array.from({ length: 12 }, () => profile);
}

function monthlyTotal(months: readonly SpendProfile[]): number {
  let total = 0;
  for (const m of months) for (const c of CATEGORIES) total += m[c];
  return total / months.length;
}

/** Projected spend inside a bonus window given average monthly spend. */
export function projectedWindowSpend(monthlySpendCents: number, windowDays: number): number {
  return (monthlySpendCents / DAYS_PER_MONTH) * windowDays;
}

/** Unrounded value of a card for 12 months of spend (index 0 = January). */
export function evaluateMonths(
  card: CreditCard,
  months: readonly SpendProfile[],
  opts: ValuationOptions,
): RawValue {
  const rules = ruleTable(card, opts.includePortalOnly ?? false);
  const cpp = centsPerPointFor(card.rewardCurrencyId, opts);

  // Pass 1: total spend landing in each cap bucket.
  const bucketSpend = new Map<string, number>();
  for (const [month, m] of months.entries()) {
    for (const c of CATEGORIES) {
      const rule = rules[month]?.[c];
      const bucket = rule ? capBucket(card, rule, month) : null;
      if (bucket) bucketSpend.set(bucket, (bucketSpend.get(bucket) ?? 0) + m[c]);
    }
  }

  // Pass 2: each cell earns the bonus rate on its pro-rata share of the cap, the after-cap rate on the rest.
  const categories = CATEGORIES.map((category) => {
    let spend = 0;
    let points = 0;
    let aboveCap = 0;
    let earnRule: EarnRule | null = null;
    for (const [month, m] of months.entries()) {
      const cell = m[category];
      const rule = rules[month]?.[category] ?? null;
      spend += cell;
      if (!rule) {
        points += (cell / 100) * card.baseMultiplier;
        continue;
      }
      if (!earnRule || rule.multiplier > earnRule.multiplier) earnRule = rule;
      const bucket = capBucket(card, rule, month);
      const total = bucket ? (bucketSpend.get(bucket) ?? 0) : 0;
      const ratio = bucket && total > (rule.capAmountCents ?? 0) ? (rule.capAmountCents ?? 0) / total : 1;
      const over = cell * (1 - ratio);
      aboveCap += over;
      points +=
        ((cell - over) / 100) * rule.multiplier +
        (over / 100) * (rule.afterCapMultiplier ?? card.baseMultiplier);
    }
    return { category, spend, points, value: points * cpp, earnRule, aboveCap };
  });

  const credits = card.credits.map((credit) => {
    const utilization = utilizationFor(credit.id, opts);
    return { credit, utilization, value: credit.annualValueCents * utilization };
  });

  const firstYear = opts.view === "first_year";
  const sub = card.signupBonus;
  let bonus: RawValue["bonus"] = null;
  if (firstYear && sub) {
    const bonusCpp = centsPerPointFor(sub.currencyId, opts);
    const feasible = projectedWindowSpend(monthlyTotal(months), sub.windowDays) >= sub.minSpendCents;
    bonus = {
      amount: sub.amount,
      currencyId: sub.currencyId,
      cpp: bonusCpp,
      value: sub.amount * bonusCpp,
      feasible,
    };
  }
  const fee = firstYear && card.firstYearFeeWaived ? 0 : card.annualFeeCents;

  const net =
    categories.reduce((s, c) => s + c.value, 0) +
    credits.reduce((s, c) => s + c.value, 0) +
    (bonus?.value ?? 0) -
    fee;
  return { categories, credits, bonus, fee, cpp, net };
}

/** Round an engine result into display line items whose totals add up exactly. */
export function roundValue(card: CreditCard, raw: RawValue, view: ValuationView): AnnualValueResult {
  const categories: CategoryValue[] = raw.categories.map((c) => {
    const annualSpendCents = Math.round(c.spend);
    const valueCents = Math.round(c.value);
    return {
      category: c.category,
      annualSpendCents,
      points: Math.round(c.points),
      valueCents,
      effectiveRateBps: annualSpendCents > 0 ? Math.round((c.value / c.spend) * 10_000) : 0,
      earnRule: c.earnRule,
      capHit: c.aboveCap > 1e-9,
      spendAboveCapCents: Math.round(c.aboveCap),
    };
  });
  const credits: CreditValue[] = raw.credits.map((c) => ({
    creditId: c.credit.id,
    name: c.credit.name,
    faceValueCents: c.credit.annualValueCents,
    utilization: c.utilization,
    valueCents: Math.round(c.value),
  }));
  const signupBonus: SignupBonusValue | null = raw.bonus && {
    amount: raw.bonus.amount,
    currencyId: raw.bonus.currencyId,
    centsPerPoint: raw.bonus.cpp,
    valueCents: Math.round(raw.bonus.value),
    feasible: raw.bonus.feasible,
  };
  const rewardsCents = categories.reduce((s, c) => s + c.valueCents, 0);
  const creditsCents = credits.reduce((s, c) => s + c.valueCents, 0);
  const bonusCents = signupBonus?.valueCents ?? 0;
  return {
    cardId: card.id,
    view,
    currencyId: card.rewardCurrencyId,
    centsPerPoint: raw.cpp,
    categories,
    credits,
    signupBonus,
    annualFeeCents: raw.fee,
    annualSpendCents: categories.reduce((s, c) => s + c.annualSpendCents, 0),
    rewardsCents,
    creditsCents,
    bonusCents,
    totalCents: rewardsCents + creditsCents + bonusCents - raw.fee,
  };
}

/**
 * A card's yearly value for a monthly spend profile: rewards per category (caps, rotating quarters and
 * portal rules applied) at the point valuation, plus credits times expected utilization, minus the fee.
 * The first-year view also adds the sign-up bonus and honours firstYearFeeWaived.
 */
export function annualValue(
  card: CreditCard,
  spendProfile: SpendProfile,
  options: ValuationOptions,
): AnnualValueResult {
  return roundValue(card, evaluateMonths(card, monthsOf(spendProfile), options), options.view ?? "ongoing");
}

/** Unrounded net value for a monthly profile; for solvers. */
export function rawNet(card: CreditCard, spendProfile: SpendProfile, options: ValuationOptions): number {
  return evaluateMonths(card, monthsOf(spendProfile), options).net;
}

/**
 * Monthly spend levels in `category` (other categories fixed at `rest`) where one of the card's caps
 * starts binding. Between these points the card's value is linear in that category's spend.
 */
export function capBreakpoints(
  card: CreditCard,
  rest: SpendProfile,
  category: Category,
  opts: ValuationOptions,
): number[] {
  const rules = ruleTable(card, opts.includePortalOnly ?? false);
  const base = new Map<string, number>();
  const slope = new Map<string, number>();
  const cap = new Map<string, number>();
  for (let month = 0; month < 12; month++) {
    for (const c of CATEGORIES) {
      const rule = rules[month]?.[c];
      const bucket = rule ? capBucket(card, rule, month) : null;
      if (!rule || !bucket) continue;
      cap.set(bucket, rule.capAmountCents ?? 0);
      if (c === category) slope.set(bucket, (slope.get(bucket) ?? 0) + 1);
      else base.set(bucket, (base.get(bucket) ?? 0) + rest[c]);
    }
  }
  const points = new Set<number>();
  for (const [bucket, months] of slope) {
    const x = ((cap.get(bucket) ?? 0) - (base.get(bucket) ?? 0)) / months;
    if (x > 0) points.add(x);
  }
  return [...points].sort((a, b) => a - b);
}
