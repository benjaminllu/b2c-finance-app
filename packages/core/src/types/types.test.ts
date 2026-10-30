import { describe, expect, it } from "vitest";
import { EarnRuleSchema, emptySpendProfile, mapIssuerCategory, SpendProfileSchema } from "./index";

describe("shared schemas", () => {
  it("maps issuer categories, defaulting to other", () => {
    expect(mapIssuerCategory(" Travel ")).toContain("airfare");
    expect(mapIssuerCategory("something odd")).toEqual(["other"]);
  });

  it("rejects a cap amount without a period", () => {
    const rule = {
      category: "dining",
      multiplier: 3,
      capAmountCents: 100_000,
      capPeriod: null,
      capGroup: null,
      afterCapMultiplier: null,
      rotating: false,
      activeQuarters: null,
      portalOnly: false,
    };
    expect(EarnRuleSchema.safeParse(rule).success).toBe(false);
  });

  it("requires every category in a spend profile", () => {
    expect(SpendProfileSchema.safeParse(emptySpendProfile()).success).toBe(true);
    expect(SpendProfileSchema.safeParse({ groceries: 100 }).success).toBe(false);
  });
});
