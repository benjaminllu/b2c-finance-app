import { describe, expect, it } from "vitest";
import { sensitivity } from "./index";
import { card, flat2, opts, premium, premiumOpts, premiumProfile, rule, spend } from "./fixtures";

describe("sensitivity", () => {
  it("finds the cents-per-point where a points card starts winning", () => {
    // premium = 32,400 pts x c + 36,000 credits - 69,500 fee; flat 2% = 36,000 -> c = 69,500 / 32,400
    const r = sensitivity(
      [premium, flat2],
      premiumProfile,
      { kind: "cents_per_point", currencyId: "test-points", from: 1, to: 3, steps: 5 },
      premiumOpts,
    );
    expect(r.steps.map((s) => s.x)).toEqual([1, 1.5, 2, 2.5, 3]);
    // at 1.5c: 48,600 + 36,000 - 69,500 = 15,100
    expect(r.steps[1]?.values).toEqual([
      { cardId: "premium", totalCents: 15_100 },
      { cardId: "flat-2", totalCents: 36_000 },
    ]);
    expect(r.steps.map((s) => s.winnerId)).toEqual(["flat-2", "flat-2", "flat-2", "premium", "premium"]);
    expect(r.flips).toHaveLength(1);
    expect(r.flips[0]?.at).toBeCloseTo(69_500 / 32_400, 10);
    expect(r.flips[0]).toMatchObject({ winnerBelowId: "flat-2", winnerAboveId: "premium" });
  });

  it("solves exact flips across cap breakpoints in category spend", () => {
    const a = card({
      id: "five-capped",
      annualFeeCents: 9_500,
      earnRules: [
        rule({ category: "groceries", multiplier: 5, capAmountCents: 600_000, capPeriod: "annual" }),
      ],
    });
    const r = sensitivity(
      [a, flat2],
      spend({}),
      { kind: "category_spend", category: "groceries", from: 0, to: 200_000, steps: 5 },
      opts,
    );
    // same lines as the two-crossing break-even test
    expect(r.flips.map((f) => [Math.round(f.at), f.winnerBelowId, f.winnerAboveId])).toEqual([
      [26_389, "flat-2", "five-capped"],
      [120_833, "five-capped", "flat-2"],
    ]);
    expect(r.steps.map((s) => s.winnerId)).toEqual([
      "flat-2",
      "five-capped",
      "five-capped",
      "flat-2",
      "flat-2",
    ]);
  });

  it("sweeps one card's credit utilization", () => {
    // premium = 48,600 + 66,000u - 69,500 vs 36,000 -> u = 56,900 / 66,000
    const r = sensitivity(
      [premium, flat2],
      premiumProfile,
      { kind: "credit_utilization", cardId: "premium", from: 0, to: 1 },
      opts,
    );
    expect(r.steps).toHaveLength(11);
    expect(r.steps[10]?.values[0]?.totalCents).toBe(45_100);
    expect(r.flips[0]?.at).toBeCloseTo(56_900 / 66_000, 10);
  });

  it("reports ties and rejects unknown cards", () => {
    const r = sensitivity(
      [flat2, card({ id: "flat-2b", baseMultiplier: 2 })],
      spend({ other: 100 }),
      { kind: "category_spend", category: "dining", from: 0, to: 0, steps: 1 },
      opts,
    );
    expect(r.steps.map((s) => s.winnerId)).toEqual([null, null]);
    expect(r.flips).toEqual([]);
    expect(() =>
      sensitivity([flat2], spend({}), { kind: "credit_utilization", cardId: "nope", from: 0, to: 1 }, opts),
    ).toThrow(/not in the list/);
  });
});
