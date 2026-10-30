import { describe, expect, it } from "vitest";
import { annualValue } from "./index";
import {
  bonusCard,
  card,
  flat2,
  groceryCapped,
  opts,
  premium,
  premiumOpts,
  premiumProfile,
  quarterlyCapped,
  rotating,
  rule,
  spend,
} from "./fixtures";

const line = (r: ReturnType<typeof annualValue>, category: string) => {
  const l = r.categories.find((c) => c.category === category);
  if (!l) throw new Error(category);
  return l;
};

describe("annualValue", () => {
  it("values a no-fee flat 2% card", () => {
    const r = annualValue(flat2, spend({ groceries: 500, other: 1000 }), opts);
    // groceries $6,000/yr x 2 = 12,000 units x 1c = $120; other $12,000 x 2 = $240
    expect(line(r, "groceries")).toMatchObject({
      annualSpendCents: 600_000,
      points: 12_000,
      valueCents: 12_000,
      effectiveRateBps: 200,
      capHit: false,
      earnRule: null,
    });
    expect(line(r, "other").valueCents).toBe(24_000);
    expect(line(r, "dining")).toMatchObject({ annualSpendCents: 0, valueCents: 0, effectiveRateBps: 0 });
    expect(r).toMatchObject({
      rewardsCents: 36_000,
      creditsCents: 0,
      bonusCents: 0,
      annualFeeCents: 0,
      totalCents: 36_000,
      annualSpendCents: 1_800_000,
      signupBonus: null,
      view: "ongoing",
      centsPerPoint: 1,
    });
  });

  it("applies an annual cap, then the base rate", () => {
    const r = annualValue(groceryCapped, spend({ groceries: 800 }), opts);
    // $9,600/yr: $6,000 x 3 = 18,000 + $3,600 x 1.5 = 5,400 -> 23,400c; rate 23,400 / 960,000 = 243.75 bps
    expect(line(r, "groceries")).toMatchObject({
      points: 23_400,
      valueCents: 23_400,
      capHit: true,
      spendAboveCapCents: 360_000,
      effectiveRateBps: 244,
    });
    expect(line(r, "groceries").earnRule?.multiplier).toBe(3);
  });

  it("applies quarterly and monthly caps per period", () => {
    const r = annualValue(quarterlyCapped, spend({ dining: 700, gas: 600 }), opts);
    // dining: $2,100/quarter -> $1,500 x 4 + $600 x 1 = 6,600 pts/q x 4 = 26,400 pts x 1.5c = 39,600c
    expect(line(r, "dining")).toMatchObject({
      points: 26_400,
      valueCents: 39_600,
      capHit: true,
      spendAboveCapCents: 240_000,
    });
    // gas: $500 x 3 + $100 x 1 = 1,600 pts/month x 12 = 19,200 pts x 1.5c = 28,800c
    expect(line(r, "gas")).toMatchObject({ points: 19_200, valueCents: 28_800, spendAboveCapCents: 120_000 });
    expect(r.totalCents).toBe(68_400);
  });

  it("does not flag a cap that is not exceeded", () => {
    const r = annualValue(quarterlyCapped, spend({ dining: 500 }), opts);
    // $1,500/quarter is exactly the cap: $6,000/yr x 4 = 24,000 pts x 1.5 = 36,000c
    expect(line(r, "dining")).toMatchObject({ valueCents: 36_000, capHit: false, spendAboveCapCents: 0 });
  });

  it("shares a rotating quarterly cap across categories and earns base in other quarters", () => {
    const r = annualValue(rotating, spend({ groceries: 400, gas: 200, dining: 300, other: 100 }), opts);
    // Q1: groceries $1,200 + gas $600 = $1,800 against a $1,500 shared cap -> each gets 5/6 at 5%.
    // groceries: $1,000 x 5 + $200 x 1 + Q2-Q4 $3,600 x 1 = 8,800c
    expect(line(r, "groceries")).toMatchObject({
      valueCents: 8_800,
      capHit: true,
      spendAboveCapCents: 20_000,
      effectiveRateBps: 183,
    });
    // gas: $500 x 5 + $100 x 1 + $1,800 x 1 = 4,400c
    expect(line(r, "gas")).toMatchObject({ valueCents: 4_400, capHit: true });
    // dining: Q3 $900 x 5 (under cap) + $2,700 x 1 = 7,200c
    expect(line(r, "dining")).toMatchObject({ valueCents: 7_200, capHit: false });
    expect(line(r, "other").valueCents).toBe(1_200);
    expect(r.totalCents).toBe(21_600);
  });

  it("values a premium card with credits, utilization defaults, portal rules and cpp overrides", () => {
    const r = annualValue(premium, premiumProfile, premiumOpts);
    // airfare $3,600 x 5 = 18,000; hotels (portal excluded) $2,400 x 1; other $12,000 x 1 -> 32,400 pts x 1.5 = 48,600c
    expect(r.rewardsCents).toBe(48_600);
    // travel $300 x 1 + dining $120 x 0.5 + streaming (default 0) = $360
    expect(r.credits.map((c) => [c.creditId, c.utilization, c.valueCents])).toEqual([
      ["travel-credit", 1, 30_000],
      ["dining-credit", 0.5, 6_000],
      ["streaming-credit", 0, 0],
    ]);
    // 48,600 + 36,000 - 69,500
    expect(r.totalCents).toBe(15_100);

    // portal: hotels at 5x adds 9,600 pts x 1.5 = 14,400c
    expect(annualValue(premium, premiumProfile, { ...premiumOpts, includePortalOnly: true }).totalCents).toBe(
      29_500,
    );
    // 2c per point: 32,400 x 2 = 64,800 + 36,000 - 69,500
    expect(
      annualValue(premium, premiumProfile, { ...premiumOpts, centsPerPoint: { "test-points": 2 } })
        .totalCents,
    ).toBe(31_300);
    // default utilization 1 picks up the streaming credit: +24,000
    expect(
      annualValue(premium, premiumProfile, { ...premiumOpts, defaultCreditUtilization: 1 }).totalCents,
    ).toBe(39_100);
  });

  it("adds the bonus and fee waiver in the first-year view only", () => {
    const profile = spend({ other: 2000 });
    // $24,000 x 1 = 24,000 pts x 1.5 = 36,000c
    const ongoing = annualValue(bonusCard, profile, opts);
    expect(ongoing).toMatchObject({
      rewardsCents: 36_000,
      annualFeeCents: 9_500,
      totalCents: 26_500,
      signupBonus: null,
    });
    const first = annualValue(bonusCard, profile, { ...opts, view: "first_year" });
    // bonus 60,000 x 1.5 = 90,000c; $2,000/mo x 90 / (365/12) = $5,918 >= $4,000
    expect(first.signupBonus).toEqual({
      amount: 60_000,
      currencyId: "test-points",
      centsPerPoint: 1.5,
      valueCents: 90_000,
      feasible: true,
    });
    expect(first).toMatchObject({
      annualFeeCents: 0,
      bonusCents: 90_000,
      totalCents: 126_000,
      view: "first_year",
    });
    // $1,000/mo projects $2,959 in 90 days: still counted, flagged infeasible
    expect(
      annualValue(bonusCard, spend({ other: 1000 }), { ...opts, view: "first_year" }).signupBonus?.feasible,
    ).toBe(false);
  });

  it("rounds each line once and keeps totals equal to the sum of lines", () => {
    // 3c/month x 12 = 36c x 1% = 0.36c per category -> each line rounds to 0, so the total is 0 (raw 1.08)
    const r = annualValue(card({ id: "tiny" }), { ...spend({}), groceries: 3, dining: 3, gas: 3 }, opts);
    expect(r.categories.every((c) => c.valueCents === 0)).toBe(true);
    expect(r.totalCents).toBe(0);
  });

  it("uses the highest-multiplier matching rule", () => {
    const c = card({
      id: "two-rules",
      earnRules: [rule({ category: "dining", multiplier: 2 }), rule({ category: "dining", multiplier: 4 })],
    });
    expect(line(annualValue(c, spend({ dining: 100 }), opts), "dining").valueCents).toBe(4_800);
  });

  it("validates inputs", () => {
    expect(() => annualValue(card({ id: "x", rewardCurrencyId: "nope" }), spend({}), opts)).toThrow(
      /Unknown reward currency/,
    );
    expect(annualValue(flat2, spend({ other: 100 }), { currencies: [] }).totalCents).toBe(2_400);
    expect(() =>
      annualValue(premium, premiumProfile, { ...opts, creditUtilization: { "travel-credit": 1.2 } }),
    ).toThrow(RangeError);
  });
});
