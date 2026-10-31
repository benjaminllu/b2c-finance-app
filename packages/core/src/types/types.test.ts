import { describe, expect, it } from "vitest";
import { card, rule } from "../cards/fixtures";
import { emptySpendProfile, mapIssuerCategory, SpendProfileSchema } from "./index";

describe("shared schemas", () => {
  it("maps issuer categories, defaulting to other", () => {
    expect(mapIssuerCategory(" Travel ")).toContain("airfare");
    expect(mapIssuerCategory("something odd")).toEqual(["other"]);
  });

  it("rejects an earn rule pointing at a missing cap group", () => {
    const earnRules = [rule({ category: "dining", multiplier: 3, capGroupId: "dining" })];
    expect(() => card({ id: "x", earnRules })).toThrow(/no capGroups entry \\"dining\\"/);
    const capGroups = [{ id: "dining", capAmountCents: 100_000, capPeriod: "annual" as const }];
    expect(card({ id: "x", earnRules, capGroups }).capGroups).toEqual(capGroups);
  });

  it("requires every category in a spend profile", () => {
    expect(SpendProfileSchema.safeParse(emptySpendProfile()).success).toBe(true);
    expect(SpendProfileSchema.safeParse({ groceries: 100 }).success).toBe(false);
  });
});
