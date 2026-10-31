/** Test-only fixtures, validated through the shared schemas so they stay realistic. Not exported from index. */
import { CreditCardSchema, emptySpendProfile, EarnRuleSchema } from "../types";
import type { CreditCard, EarnRule, RewardCurrency, SpendProfile } from "../types";
import type { ValuationOptions } from "./engine";

export const usd: RewardCurrency = {
  id: "usd",
  name: "Cash back",
  issuerId: null,
  kind: "cash",
  defaultCentsPerPoint: 1,
  valuationSource: "Face value",
  valuationSourceUrl: null,
  isSample: false,
};

export const pts: RewardCurrency = {
  id: "test-points",
  name: "Test Points",
  issuerId: "test-bank",
  kind: "points",
  defaultCentsPerPoint: 1.5,
  valuationSource: "Test valuation",
  valuationSourceUrl: null,
  isSample: true,
};

export const opts: ValuationOptions = { currencies: [usd, pts] };

export function rule(r: Partial<EarnRule> & Pick<EarnRule, "category" | "multiplier">): EarnRule {
  return EarnRuleSchema.parse({
    capGroupId: null,
    afterCapMultiplier: null,
    rotating: false,
    activeQuarters: null,
    portalOnly: false,
    ...r,
  });
}

export function card(c: Partial<CreditCard> & Pick<CreditCard, "id">): CreditCard {
  return CreditCardSchema.parse({
    name: c.id,
    issuerId: "test-bank",
    network: "visa",
    productFamily: null,
    annualFeeCents: 0,
    firstYearFeeWaived: false,
    rewardCurrencyId: "usd",
    baseMultiplier: 1,
    earnRules: [],
    capGroups: [],
    credits: [],
    signupBonus: null,
    isBusiness: false,
    foreignTransactionFeeBps: 0,
    sourceUrl: "https://example.com/test",
    lastVerifiedAt: "2026-10-30T00:00:00Z",
    isSample: true,
    affiliateUrl: null,
    isAffiliate: false,
    ...c,
  });
}

/** Monthly spend in dollars for the categories given; everything else 0. */
export function spend(dollars: Partial<Record<keyof SpendProfile, number>>): SpendProfile {
  const p = emptySpendProfile();
  for (const [k, v] of Object.entries(dollars)) p[k as keyof SpendProfile] = Math.round((v ?? 0) * 100);
  return p;
}

export const flat2 = card({ id: "flat-2", baseMultiplier: 2 });

/** 3% groceries up to $6,000/yr, then the 1.5% base rate. */
export const groceryCapped = card({
  id: "grocery-capped",
  baseMultiplier: 1.5,
  earnRules: [rule({ category: "groceries", multiplier: 3, capGroupId: "groceries" })],
  capGroups: [{ id: "groceries", capAmountCents: 600_000, capPeriod: "annual" }],
});

/** Points card: 4x dining up to $1,500/quarter then 1x; 3x gas up to $500/month then 1x. */
export const quarterlyCapped = card({
  id: "quarterly-capped",
  rewardCurrencyId: "test-points",
  earnRules: [
    rule({ category: "dining", multiplier: 4, capGroupId: "dining", afterCapMultiplier: 1 }),
    rule({ category: "gas", multiplier: 3, capGroupId: "gas" }),
  ],
  capGroups: [
    { id: "dining", capAmountCents: 150_000, capPeriod: "quarterly" },
    { id: "gas", capAmountCents: 50_000, capPeriod: "monthly" },
  ],
});

/** Rotating 5%: groceries + gas in Q1, dining in Q3, one shared $1,500/quarter cap; 1% otherwise. */
export const rotating = card({
  id: "rotating-5",
  earnRules: (["groceries", "gas"] as const)
    .map((category) =>
      rule({
        category,
        multiplier: 5,
        capGroupId: "rotating",
        rotating: true,
        activeQuarters: [1],
      }),
    )
    .concat(
      rule({
        category: "dining",
        multiplier: 5,
        capGroupId: "rotating",
        rotating: true,
        activeQuarters: [3],
      }),
    ),
  capGroups: [{ id: "rotating", capAmountCents: 150_000, capPeriod: "quarterly" }],
});

/** $695 points card: 5x airfare, 5x hotels via portal only, three credits worth $660/yr. */
export const premium = card({
  id: "premium",
  annualFeeCents: 69_500,
  rewardCurrencyId: "test-points",
  earnRules: [
    rule({ category: "airfare", multiplier: 5 }),
    rule({ category: "hotels", multiplier: 5, portalOnly: true }),
  ],
  credits: [
    {
      id: "travel-credit",
      name: "Travel credit",
      annualValueCents: 30_000,
      frequency: "annual",
      usageConstraints: "",
    },
    {
      id: "dining-credit",
      name: "Dining credit",
      annualValueCents: 12_000,
      frequency: "monthly",
      usageConstraints: "",
    },
    {
      id: "streaming-credit",
      name: "Streaming credit",
      annualValueCents: 24_000,
      frequency: "monthly",
      usageConstraints: "",
    },
  ],
});
export const premiumProfile = spend({ airfare: 300, hotels: 200, other: 1000 });
export const premiumOpts: ValuationOptions = {
  ...opts,
  creditUtilization: { "travel-credit": 1, "dining-credit": 0.5 },
};

/** $95 points card, fee waived in year one, 60,000-point bonus after $4,000 in 90 days. */
export const bonusCard = card({
  id: "bonus-card",
  annualFeeCents: 9_500,
  firstYearFeeWaived: true,
  rewardCurrencyId: "test-points",
  signupBonus: { amount: 60_000, currencyId: "test-points", minSpendCents: 400_000, windowDays: 90 },
});
