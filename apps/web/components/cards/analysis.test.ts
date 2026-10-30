import { seed } from "@optima/seed";
import { describe, expect, it } from "vitest";
import { analyze } from "./analysis";
import { decodeState, defaultState } from "./state";

describe("analyze", () => {
  const cards = ["citi-double-cash", "chase-sapphire-reserve"].map(
    (id) => seed.cards.find((c) => c.id === id)!,
  );

  it("ranks cards, explains the winner, and agrees with the totals", () => {
    const a = analyze(cards, seed.currencies, defaultState());
    expect(a.winner?.marginCents).toBe(
      (a.ranked[0]?.result.totalCents ?? 0) - (a.ranked[1]?.result.totalCents ?? 0),
    );
    expect(a.winner?.reason).toContain("wins by");
    expect(a.wallet.cards).toHaveLength(2);
  });

  it("counts credits only once the user says they use them", () => {
    const none = analyze(cards, seed.currencies, defaultState());
    const creditId = cards[1]!.credits[0]!.id;
    const used = analyze(cards, seed.currencies, decodeState(new URLSearchParams(`u=${creditId}:100`)));
    expect(none.rows[1]?.result.creditsCents).toBe(0);
    expect(used.rows[1]?.result.creditsCents).toBeGreaterThan(0);
    expect(used.rows[1]?.effectiveFee.effectiveFeeCents).toBeLessThan(
      none.rows[1]?.effectiveFee.effectiveFeeCents ?? 0,
    );
  });
});
