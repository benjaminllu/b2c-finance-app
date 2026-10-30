import { describe, expect, it } from "vitest";
import type { AccountRecord, BonusOffer, EligibilityRule } from "../types";
import { addDays, addMonths, checkEligibility } from "./eligibility";

const prov = { sourceUrl: "https://example.com/r", lastVerifiedAt: "2026-10-30T00:00:00Z", isSample: true };

const offer = (o: Partial<BonusOffer> = {}): BonusOffer => ({
  id: "o",
  productType: "credit_card",
  institutionId: "chase",
  cardId: "csp",
  depositProductId: null,
  title: "t",
  bonusValue: 60000,
  bonusCurrencyId: "chase-ur",
  requirements: {
    minSpendCents: null,
    spendWindowDays: null,
    directDepositTotalCents: null,
    directDepositCount: null,
    directDepositWindowDays: null,
    minDepositCents: null,
    minBalanceCents: null,
    holdingPeriodDays: null,
    other: [],
  },
  monthlyFeeCents: 0,
  monthlyFeeWaivedByRequirements: false,
  eligibility: { lifetimeLimit: false, lookbackMonths: null, lookbackScope: "product", notes: [] },
  eligibleStates: null,
  earlyClosureFeeCents: 0,
  earlyClosureWindowDays: null,
  expiresAt: null,
  affiliateUrl: null,
  isAffiliate: false,
  ...prov,
  ...o,
});

let n = 0;
const acct = (a: Partial<AccountRecord>): AccountRecord => ({
  id: `a${n++}`,
  institutionId: "citi",
  productType: "credit_card",
  productId: null,
  productFamily: null,
  name: "Some card",
  openedAt: "2026-01-01",
  closedAt: null,
  isBusiness: false,
  bonusReceivedAt: null,
  ...a,
});

const fiveTwentyFour: EligibilityRule = {
  id: "chase-5-24",
  kind: "max_new_accounts",
  name: "5/24",
  description: "",
  appliesTo: { institutionIds: ["chase"], productTypes: ["credit_card"] },
  count: 5,
  windowMonths: 24,
  countScope: "all_institutions",
  countedProductTypes: ["credit_card"],
  countBusiness: false,
  ...prov,
};

describe("date helpers", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("checkEligibility", () => {
  it("is eligible with no history", () => {
    const r = checkEligibility(offer(), { rules: [fiveTwentyFour], history: [], asOf: "2026-10-30" });
    expect(r).toEqual({ eligible: true, issues: [], eligibleFrom: "2026-10-30" });
  });

  it("applies 5/24, ignoring business cards and dating when the oldest counted card ages out", () => {
    const history = [
      acct({ openedAt: "2025-01-10" }),
      acct({ openedAt: "2025-03-01" }),
      acct({ openedAt: "2025-06-01" }),
      acct({ openedAt: "2026-02-01" }),
      acct({ openedAt: "2026-05-01" }),
      acct({ openedAt: "2026-06-01", isBusiness: true }),
      acct({ openedAt: "2024-01-01" }), // outside 24 months
    ];
    const r = checkEligibility(offer(), { rules: [fiveTwentyFour], history, asOf: "2026-10-30" });
    expect(r.eligible).toBe(false);
    // 5 counted; the oldest (2025-01-10) must age out: 2027-01-10.
    expect(r.eligibleFrom).toBe("2027-01-10");
    // Eligible on that date, and hypothetical future accounts are ignored before they open.
    expect(checkEligibility(offer(), { rules: [fiveTwentyFour], history, asOf: "2027-01-10" }).eligible).toBe(
      true,
    );
  });

  it("does not apply rules scoped to another institution or product type", () => {
    const history = Array.from({ length: 6 }, () => acct({ openedAt: "2026-05-01" }));
    const r = checkEligibility(offer({ institutionId: "amex" }), {
      rules: [fiveTwentyFour],
      history,
      asOf: "2026-10-30",
    });
    expect(r.eligible).toBe(true);
  });

  it("handles family lookback measured from the bonus date", () => {
    const rule: EligibilityRule = {
      id: "sapphire-48",
      kind: "bonus_lookback",
      name: "Sapphire 48 months",
      description: "",
      appliesTo: { institutionIds: ["chase"], productTypes: ["credit_card"] },
      months: 48,
      productScope: "product_family",
      measureFrom: "bonus_received",
      ...prov,
    };
    const history = [
      acct({
        institutionId: "chase",
        productId: "csr",
        productFamily: "sapphire",
        openedAt: "2023-01-01",
        bonusReceivedAt: "2023-03-15",
      }),
    ];
    const r = checkEligibility(offer(), {
      rules: [rule],
      history,
      asOf: "2026-10-30",
      cards: [{ id: "csp", productFamily: "sapphire" }],
    });
    expect(r.eligibleFrom).toBe("2027-03-15");
  });

  it("treats lifetime and still-open closed-measured rules as never clearing on their own", () => {
    const closedRule: EligibilityRule = {
      id: "chase-checking",
      kind: "bonus_lookback",
      name: "Checking",
      description: "",
      appliesTo: { institutionIds: ["chase"], productTypes: ["checking"] },
      months: 24,
      productScope: "institution",
      measureFrom: "account_closed",
      ...prov,
    };
    const checking = offer({ productType: "checking", cardId: null, depositProductId: "total" });
    const history = [acct({ institutionId: "chase", productType: "checking", name: "Total Checking" })];
    expect(
      checkEligibility(checking, { rules: [closedRule], history, asOf: "2026-10-30" }).eligibleFrom,
    ).toBe(null);

    const lifetime = offer({
      eligibility: { lifetimeLimit: true, lookbackMonths: null, lookbackScope: "product", notes: [] },
    });
    const had = [acct({ institutionId: "chase", productId: "csp", openedAt: "2015-01-01" })];
    const r = checkEligibility(lifetime, { rules: [], history: had, asOf: "2026-10-30" });
    expect(r.issues[0]?.kind).toBe("offer_lifetime");
    expect(r.eligibleFrom).toBeNull();
  });

  it("enforces days between apps and max open accounts", () => {
    const rules: EligibilityRule[] = [
      {
        id: "gap",
        kind: "min_days_between_apps",
        name: "Gap",
        description: "",
        appliesTo: { institutionIds: ["chase"], productTypes: ["credit_card"] },
        days: 90,
        ...prov,
      },
      {
        id: "max-open",
        kind: "max_open_accounts",
        name: "Max open",
        description: "",
        appliesTo: { institutionIds: ["chase"], productTypes: ["credit_card"] },
        count: 2,
        ...prov,
      },
    ];
    const history = [
      acct({ institutionId: "chase", openedAt: "2026-09-01" }),
      acct({ institutionId: "chase", openedAt: "2020-01-01", closedAt: "2026-12-01" }),
    ];
    const r = checkEligibility(offer(), { rules, history, asOf: "2026-10-30" });
    expect(r.issues.map((i) => i.kind).sort()).toEqual(["max_open_accounts", "min_days_between_apps"]);
    expect(r.issues.find((i) => i.kind === "min_days_between_apps")?.eligibleFrom).toBe("2026-11-30");
    expect(r.eligibleFrom).toBeNull();
  });
});
