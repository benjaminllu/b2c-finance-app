import { describe, expect, it } from "vitest";
import { optimizeWallet } from "./index";
import { card, flat2, opts, rotating, rule, spend } from "./fixtures";

describe("optimizeWallet", () => {
  it("overflows a capped category to the next-best card", () => {
    const capped = card({
      id: "six-capped",
      annualFeeCents: 9_500,
      earnRules: [
        rule({ category: "groceries", multiplier: 6, capAmountCents: 600_000, capPeriod: "annual" }),
      ],
    });
    const r = optimizeWallet([capped, flat2], spend({ groceries: 1000, other: 500 }), opts);
    // Jan-Jun groceries go to the 6% card until its $6,000 cap is used; Jul-Dec overflow to 2% (beats 1%).
    expect(r.assignments.find((a) => a.category === "groceries")).toEqual({
      category: "groceries",
      annualSpendCents: 1_200_000,
      primaryCardId: "six-capped",
      splits: [
        { cardId: "six-capped", annualSpendCents: 600_000, share: 0.5 },
        { cardId: "flat-2", annualSpendCents: 600_000, share: 0.5 },
      ],
    });
    expect(r.assignments.find((a) => a.category === "other")?.splits.map((s) => s.cardId)).toEqual([
      "flat-2",
    ]);
    expect(r.assignments.find((a) => a.category === "dining")?.primaryCardId).toBeNull();
    // capped: $6,000 x 6% = 36,000 - 9,500 = 26,500. flat: ($6,000 + $6,000) x 2% = 24,000.
    expect(r.cards.map((c) => c.totalCents)).toEqual([26_500, 24_000]);
    expect(r.totalNetCents).toBe(50_500);
    // alone: capped = 36,000 + $6,000 grocery overflow x 1% (6,000) + $6,000 other x 1% (6,000) - 9,500 = 38,500;
    // flat = $18,000 x 2% = 36,000
    expect(r.singleCard).toEqual([
      { cardId: "six-capped", totalCents: 38_500 },
      { cardId: "flat-2", totalCents: 36_000 },
    ]);
    expect(r).toMatchObject({ bestSingleCardId: "six-capped", gainOverBestSingleCents: 12_000 });
  });

  it("routes rotating quarters and a shared cap month by month", () => {
    const r = optimizeWallet(
      [rotating, flat2],
      spend({ groceries: 400, gas: 200, dining: 300, other: 100 }),
      opts,
    );
    // Q1: Jan+Feb groceries+gas = $1,200 on the 5% card; March: $300 groceries fills the $1,500 cap,
    // the other $100 groceries and $200 gas go to 2%. Q3 dining $900 at 5%. Everything else at 2%.
    // rotating: ($1,100 + $400 + $900) x 5% = 12,000. flat: $9,600 x 2% = 19,200.
    expect(r.cards.map((c) => c.totalCents)).toEqual([12_000, 19_200]);
    expect(r.totalNetCents).toBe(31_200);
    // alone: rotating 21,600 (see engine test), flat $12,000 x 2% = 24,000
    expect(r.gainOverBestSingleCents).toBe(7_200);
  });

  it("counts a held card's fee even when it gets no spend", () => {
    const feeOnly = card({ id: "fee-only", annualFeeCents: 10_000 });
    const r = optimizeWallet([flat2, feeOnly], spend({ other: 100 }), opts);
    expect(r.cards.map((c) => c.totalCents)).toEqual([2_400, -10_000]);
    expect(r.gainOverBestSingleCents).toBe(-10_000);
  });

  it("rejects bad wallets", () => {
    expect(() => optimizeWallet([], spend({}), opts)).toThrow(RangeError);
    const five = ["a", "b", "c", "d", "e"].map((id) => card({ id }));
    expect(() => optimizeWallet(five, spend({}), opts)).toThrow(RangeError);
    expect(() => optimizeWallet([flat2, flat2], spend({}), opts)).toThrow(/duplicate/);
  });
});
