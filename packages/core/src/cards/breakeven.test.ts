import { describe, expect, it } from "vitest";
import { breakEvenAnnualFee, breakEvenCreditUtilization, breakEvenSpend, flatRateCard } from "./index";
import { envelopeFlips } from "./envelope";
import { bonusCard, card, flat2, opts, premium, premiumOpts, premiumProfile, rule, spend } from "./fixtures";

const empty = spend({});

describe("breakEvenSpend", () => {
  it("returns no crossing when one card always wins, and detects ties", () => {
    const r = breakEvenSpend(flat2, flatRateCard({ multiplier: 1.5 }), "groceries", empty, opts);
    expect(r).toMatchObject({ crossings: [], alwaysWinner: "a" });
    expect(r.curve.map((p) => [p.monthlySpendCents, p.valueACents, p.valueBCents])).toEqual([
      [0, 0, 0],
      // $2,000/mo x 12 x 2% = 48,000; x 1.5% = 36,000
      [200_000, 48_000, 36_000],
    ]);
    expect(breakEvenSpend(flat2, flat2, "dining", empty, opts).alwaysWinner).toBe("tie");
  });

  it("finds one crossing past the last breakpoint (fee vs higher rate)", () => {
    const a = card({
      id: "three-pct",
      annualFeeCents: 25_000,
      earnRules: [rule({ category: "groceries", multiplier: 3 })],
    });
    // A = 0.36x - 25,000, B = 0.24x  ->  x = 25,000 / 0.12 = 208,333.33c a month
    const r = breakEvenSpend(a, flat2, "groceries", spend({ groceries: 999 }), opts);
    expect(r.crossings).toEqual([{ monthlySpendCents: 208_333, winnerBelow: "b", winnerAbove: "a" }]);
    expect(r.alwaysWinner).toBeNull();
    const cross = r.curve.find((p) => p.isCrossing);
    expect(cross?.valueACents).toBe(cross?.valueBCents);
    // range end = 1.25 x 208,333.33
    expect(r.curve.at(-1)?.monthlySpendCents).toBe(260_417);
  });

  it("finds two crossings around a capped bonus category", () => {
    const a = card({
      id: "five-capped",
      annualFeeCents: 9_500,
      earnRules: [
        rule({ category: "groceries", multiplier: 5, capAmountCents: 600_000, capPeriod: "annual" }),
      ],
    });
    // Below the cap (x <= 50,000): A = 0.6x - 9,500 vs B = 0.24x -> x = 9,500 / 0.36 = 26,388.89
    // Above: A = 30,000 + 0.12(x - 50,000) - 9,500 = 14,500 + 0.12x vs 0.24x -> x = 120,833.33
    const r = breakEvenSpend(a, flat2, "groceries", empty, opts);
    expect(r.crossings).toEqual([
      { monthlySpendCents: 26_389, winnerBelow: "b", winnerAbove: "a" },
      { monthlySpendCents: 120_833, winnerBelow: "a", winnerAbove: "b" },
    ]);
    expect(
      r.curve.map((p) => [p.monthlySpendCents, p.valueACents, p.valueBCents, p.capReached, p.isCrossing]),
    ).toEqual([
      [0, -9_500, 0, [], false],
      [26_389, 6_333, 6_333, [], true],
      [50_000, 20_500, 12_000, ["a"], false],
      [120_833, 29_000, 29_000, [], true],
      [200_000, 38_500, 48_000, [], false],
    ]);
    // A custom range end trims the curve but not the crossings
    const short = breakEvenSpend(a, flat2, "groceries", empty, { ...opts, maxMonthlySpendCents: 60_000 });
    expect(short.crossings).toHaveLength(2);
    expect(short.curve.at(-1)?.monthlySpendCents).toBe(60_000);
  });
});

describe("breakEvenCreditUtilization", () => {
  // Premium at 0% credits: 48,600 - 69,500 = -20,900. Credits face: 30,000 + 12,000 + 24,000 = 66,000.
  it("solves the needed share when A needs some credits", () => {
    // flat 2% on $1,500/mo = 36,000. gap = 56,900 -> 56,900 / 66,000 = 86.2%
    const r = breakEvenCreditUtilization(premium, flat2, premiumProfile, premiumOpts);
    expect(r.status).toBe("needs_utilization");
    expect(r.utilization).toBeCloseTo(56_900 / 66_000, 10);
    expect(r).toMatchObject({
      creditsUsedCents: 56_900,
      creditFaceValueCents: 66_000,
      shortfallAtFullCents: 0,
    });
  });

  it("handles A winning at 0% and losing at 100%", () => {
    // B: 1% with a $500 fee -> 18,000 - 50,000 = -32,000 < -20,900
    const weak = card({ id: "weak", annualFeeCents: 50_000 });
    expect(breakEvenCreditUtilization(premium, weak, premiumProfile, premiumOpts)).toMatchObject({
      status: "wins_at_zero",
      utilization: 0,
      creditsUsedCents: 0,
    });
    // B: flat 5% -> 90,000; gap 110,900 > 66,000 -> short by 44,900
    expect(
      breakEvenCreditUtilization(premium, flatRateCard({ multiplier: 5 }), premiumProfile, premiumOpts),
    ).toMatchObject({
      status: "loses_at_full",
      utilization: null,
      creditsUsedCents: null,
      shortfallAtFullCents: 44_900,
    });
    // A with no credits that trails B
    expect(breakEvenCreditUtilization(card({ id: "plain" }), flat2, premiumProfile, opts)).toMatchObject({
      status: "loses_at_full",
      creditFaceValueCents: 0,
      shortfallAtFullCents: 18_000,
    });
  });
});

describe("breakEvenAnnualFee", () => {
  it("returns the highest fee that still ties the 2% baseline", () => {
    // gross 48,600 + 36,000 = 84,600 vs baseline 36,000 -> max fee 48,600; current 69,500
    expect(breakEvenAnnualFee(premium, premiumProfile, premiumOpts)).toEqual({
      maxAnnualFeeCents: 48_600,
      currentAnnualFeeCents: 69_500,
      headroomCents: -20_900,
      beatsBaseline: false,
      baselineCardId: "baseline-flat-2",
    });
  });

  it("goes negative when the card loses even with no fee, and counts the bonus in year one", () => {
    const profile = spend({ other: 2000 });
    // ongoing: 36,000 vs 48,000 -> -12,000
    expect(breakEvenAnnualFee(bonusCard, profile, opts)).toMatchObject({
      maxAnnualFeeCents: -12_000,
      beatsBaseline: false,
    });
    // first year: 126,000 vs 48,000 -> 78,000, and the waived fee means it wins
    expect(breakEvenAnnualFee(bonusCard, profile, { ...opts, view: "first_year" })).toMatchObject({
      maxAnnualFeeCents: 78_000,
      headroomCents: 68_500,
      beatsBaseline: true,
    });
    // custom baseline: 1.5% -> 36,000 vs 36,000 = 0
    expect(
      breakEvenAnnualFee(bonusCard, profile, opts, flatRateCard({ multiplier: 1.5 })).maxAnnualFeeCents,
    ).toBe(0);
  });
});

describe("envelopeFlips", () => {
  it("finds a middle leader inside one segment", () => {
    // A = x, B = -10 + 4x, C = -2 + 2x: C passes A at 2, B passes C at 4
    expect(
      envelopeFlips(
        [0, 10],
        [
          [0, -10, -2],
          [10, 30, 18],
        ],
      ).flips,
    ).toEqual([
      { at: 2, from: 0, to: 2 },
      { at: 4, from: 2, to: 1 },
    ]);
  });

  it("flips at a node when tied lines diverge", () => {
    expect(
      envelopeFlips(
        [0, 1, 2],
        [
          [0, 0],
          [1, 1],
          [1, 3],
        ],
      ),
    ).toEqual({ first: 0, flips: [{ at: 1, from: 0, to: 1 }] });
  });
});
