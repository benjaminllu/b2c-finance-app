import { describe, expect, it } from "vitest";
import { CreditCardSchema } from "../types";
import { creditUsageToUtilization, effectiveAnnualFee, flatRateCard, signupBonusFeasibility } from "./index";
import { bonusCard, flat2, premium, spend } from "./fixtures";

describe("flatRateCard", () => {
  it("builds a valid no-fee baseline, 2% cash back by default", () => {
    const c = flatRateCard();
    expect(CreditCardSchema.parse(c)).toEqual(c);
    expect(c).toMatchObject({
      id: "baseline-flat-2",
      baseMultiplier: 2,
      rewardCurrencyId: "usd",
      annualFeeCents: 0,
      credits: [],
      signupBonus: null,
    });
    expect(flatRateCard({ multiplier: 1.5 })).toMatchObject({
      id: "baseline-flat-1-5",
      name: "Flat 1.5% cash back",
    });
  });
});

describe("signupBonusFeasibility", () => {
  it("projects window spend with 365/12-day months", () => {
    // $1,000/mo x 12 / 365 x 90 = 295,890.41c; short 400,000 - 295,890.41 = 104,109.59
    // extra/month = shortfall / (90 / (365/12)) = 38,000,000/365 x 365/1,080 = 35,185.19
    expect(signupBonusFeasibility(bonusCard, spend({ other: 1000 }))).toEqual({
      minSpendCents: 400_000,
      windowDays: 90,
      monthlySpendCents: 100_000,
      projectedSpendCents: 295_890,
      feasible: false,
      shortfallCents: 104_110,
      extraMonthlySpendCents: 35_185,
    });
    expect(signupBonusFeasibility(bonusCard, spend({ other: 2000 }))).toMatchObject({
      feasible: true,
      shortfallCents: 0,
      extraMonthlySpendCents: 0,
      projectedSpendCents: 591_781,
    });
    expect(signupBonusFeasibility(flat2, spend({ other: 2000 }))).toBeNull();
  });
});

describe("effectiveAnnualFee", () => {
  it("subtracts credits actually used", () => {
    const r = effectiveAnnualFee(premium, {
      "travel-credit": { kind: "full" },
      "dining-credit": { kind: "partial", percent: 50 },
      "streaming-credit": { kind: "never" },
    });
    // 69,500 - (30,000 + 6,000 + 0)
    expect(r).toMatchObject({ annualFeeCents: 69_500, creditsUsedCents: 36_000, effectiveFeeCents: 33_500 });
    expect(r.credits.map((c) => c.usedCents)).toEqual([30_000, 6_000, 0]);
    // unmarked credits count as never used
    expect(effectiveAnnualFee(premium, {}).effectiveFeeCents).toBe(69_500);
  });

  it("validates partial percentages", () => {
    expect(creditUsageToUtilization({ kind: "partial", percent: 25 })).toBe(0.25);
    expect(() => creditUsageToUtilization({ kind: "partial", percent: 150 })).toThrow(RangeError);
  });
});
