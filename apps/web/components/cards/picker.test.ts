import { seed } from "@optima/seed";
import { describe, expect, it } from "vitest";
import { buildOptions } from "./analysis";
import { filterAndSort, NO_FILTERS, pickerRows } from "./picker";
import { defaultState } from "./state";

const currencies = new Map(seed.currencies.map((c) => [c.id, c]));
const issuers = new Map(seed.issuers.map((i) => [i.id, i.name]));
const issuerName = (id: string) => issuers.get(id) ?? "";

function rows(centsPerPoint: Record<string, number> = {}) {
  const state = { ...defaultState(), centsPerPoint };
  return pickerRows(seed.cards, currencies, state.spend, buildOptions(seed.currencies, state));
}

describe("card picker", () => {
  it("values the catch-all rate at the user's point valuation", () => {
    const csp = seed.cards.find((c) => c.id === "chase-sapphire-preferred")!;
    const at = (cpp: number) =>
      rows({ [csp.rewardCurrencyId]: cpp }).find((r) => r.card.id === csp.id)!.catchAllCents;
    expect(at(2)).toBe(csp.baseMultiplier * 2);
    expect(at(1)).toBe(csp.baseMultiplier);
  });

  it("applies every filter", () => {
    const all = rows();
    const pick = (f: Partial<typeof NO_FILTERS>) =>
      filterAndSort(all, { ...NO_FILTERS, ...f }, "name", issuerName);
    expect(pick({})).toHaveLength(seed.cards.length);
    expect(pick({ maxFeeCents: 0 }).every((r) => r.card.annualFeeCents === 0)).toBe(true);
    expect(pick({ minCatchAllCents: 2 }).every((r) => r.catchAllCents >= 2)).toBe(true);
    expect(pick({ minCatchAllCents: 2 }).map((r) => r.card.id)).toContain("citi-double-cash");
    const issuerId = seed.cards[0]!.issuerId;
    expect(pick({ issuerId }).every((r) => r.card.issuerId === issuerId)).toBe(true);
    expect(pick({ kind: "cash" }).every((r) => r.kind === "cash")).toBe(true);
    expect(pick({ noForeignFee: true }).every((r) => r.card.foreignTransactionFeeBps === 0)).toBe(true);
    expect(pick({ hasBonus: true }).every((r) => r.card.signupBonus !== null)).toBe(true);
    expect(pick({ audience: "personal" }).every((r) => !r.card.isBusiness)).toBe(true);
    expect(pick({ q: issuerName(issuerId).toLowerCase() }).length).toBeGreaterThan(0);
    expect(pick({ q: "no such card zzz" })).toHaveLength(0);
  });

  it("sorts by the chosen key, breaking ties by name", () => {
    const all = rows();
    const fees = filterAndSort(all, NO_FILTERS, "fee_asc", issuerName);
    for (let i = 1; i < fees.length; i++) {
      const [a, b] = [fees[i - 1]!.card, fees[i]!.card];
      expect(
        a.annualFeeCents < b.annualFeeCents ||
          (a.annualFeeCents === b.annualFeeCents && a.name.localeCompare(b.name) <= 0),
      ).toBe(true);
    }
    const value = filterAndSort(all, NO_FILTERS, "value", issuerName).map((r) => r.valueCents);
    expect(value).toEqual([...value].sort((a, b) => b - a));
  });
});
