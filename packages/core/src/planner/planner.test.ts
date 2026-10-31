import { describe, expect, it } from "vitest";
import type { AccountRecord, BonusOffer, CreditCard, EligibilityRule } from "../types";
import { buildPlan, plannerOfferValue, type PlannerInput } from ".";

const prov = { sourceUrl: "https://example.com", lastVerifiedAt: "2026-10-01T00:00:00Z", isSample: true };
const noReq = {
  minSpendCents: null,
  spendWindowDays: null,
  directDepositTotalCents: null,
  directDepositCount: null,
  directDepositWindowDays: null,
  minDepositCents: null,
  minBalanceCents: null,
  holdingPeriodDays: null,
  other: [],
};

function cardOffer(id: string, value: number, minSpend: number, extra: Partial<BonusOffer> = {}): BonusOffer {
  return {
    id,
    productType: "credit_card",
    institutionId: extra.institutionId ?? "bank-x",
    cardId: id,
    depositProductId: null,
    title: id,
    bonusValue: value,
    bonusCurrencyId: "usd",
    requirements: { ...noReq, minSpendCents: minSpend, spendWindowDays: 90 },
    monthlyFeeCents: 0,
    monthlyFeeWaivedByRequirements: false,
    eligibility: { lifetimeLimit: false, lookbackMonths: null, lookbackScope: "product", notes: [] },
    eligibleStates: null,
    earlyClosureFeeCents: 0,
    earlyClosureWindowDays: null,
    hardPull: true,
    bonusPostingDays: null,
    expiresAt: null,
    affiliateUrl: null,
    isAffiliate: false,
    ...prov,
    ...extra,
  };
}

function bankOffer(id: string, value: number, dd: number, extra: Partial<BonusOffer> = {}): BonusOffer {
  return cardOffer(id, value, 0, {
    productType: "checking",
    cardId: null,
    depositProductId: id,
    hardPull: false,
    requirements: {
      ...noReq,
      directDepositTotalCents: dd,
      directDepositCount: 1,
      directDepositWindowDays: 30,
    },
    ...extra,
  });
}

const card = (id: string, annualFeeCents = 0, firstYearFeeWaived = false): CreditCard =>
  ({ id, productFamily: null, annualFeeCents, firstYearFeeWaived, isBusiness: false }) as CreditCard;

const account = (id: string, openedAt: string, extra: Partial<AccountRecord> = {}): AccountRecord => ({
  id,
  institutionId: "other",
  productType: "credit_card",
  productId: null,
  productFamily: null,
  name: id,
  openedAt,
  closedAt: null,
  isBusiness: false,
  bonusReceivedAt: null,
  ...extra,
});

function input(offers: BonusOffer[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return {
    history: [],
    monthlySpendCents: 1_000_000,
    directDepositMonthlyCents: 1_000_000,
    directDepositSplits: 3,
    maxPullsPer6Months: 10,
    maxPullsPer12Months: 10,
    horizonMonths: 12,
    startDate: "2026-11-01",
    offers,
    rules: [],
    cards: offers.filter((o) => o.cardId).map((o) => card(o.id)),
    currencies: [{ id: "usd", defaultCentsPerPoint: 1 }],
    ...extra,
  };
}

const rule = (r: Partial<EligibilityRule> & Pick<EligibilityRule, "kind">): EligibilityRule =>
  ({
    id: "r",
    name: "Rule",
    description: "",
    appliesTo: { institutionIds: ["chase"], productTypes: ["credit_card"] },
    ...prov,
    ...r,
  }) as EligibilityRule;
const fiveTwentyFour = rule({
  id: "chase-5-24",
  name: "Chase 5/24",
  kind: "max_new_accounts",
  count: 5,
  windowMonths: 24,
  countScope: "all_institutions",
  countedProductTypes: ["credit_card"],
  countBusiness: false,
});

const stepOf = (plan: ReturnType<typeof buildPlan>, id: string) => plan.steps.find((s) => s.offerId === id);

describe("buildPlan", () => {
  it("opens everything right away with an empty history and ample capacity", () => {
    const plan = buildPlan(input([cardOffer("a", 50_000, 300_000), bankOffer("b", 20_000, 100_000)]));
    expect(plan.steps.map((s) => [s.offerId, s.month, s.applyDate])).toEqual([
      ["a", 0, "2026-11-01"],
      ["b", 0, "2026-11-01"],
    ]);
    expect(plan.totalNetCents).toBe(70_000);
    expect(stepOf(plan, "a")?.loads).toEqual([
      { kind: "spend", fromMonth: 0, months: 3, totalCents: 300_000, monthlyCents: 100_000 },
    ]);
    expect(stepOf(plan, "a")?.bonusDate).toBe("2027-01-30");
    expect(plan.months[0]?.spendCents).toBe(100_000);
    expect(plan.months[0]?.pullsLast6).toBe(1);
    expect(plan.skipped).toEqual([]);
  });

  it("waits for 5/24 to clear when the oldest card ages out", () => {
    const history = ["2025-03-15", "2025-06-01", "2025-09-01", "2026-01-01", "2026-05-01"].map((d, i) =>
      account(`h${i}`, d),
    );
    const plan = buildPlan(
      input([cardOffer("chase-card", 60_000, 400_000, { institutionId: "chase" })], {
        history,
        rules: [fiveTwentyFour],
      }),
    );
    const step = stepOf(plan, "chase-card");
    expect(step?.month).toBe(4);
    expect(step?.applyDate).toBe("2027-03-15");
    expect(step?.reasons.join(" ")).toMatch(/Chase 5\/24.*eligible on 2027-03-15/);
  });

  it("counts planned cards toward 5/24 and orders applications to keep both", () => {
    const history = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].map((d, i) =>
      account(`h${i}`, d),
    );
    const plan = buildPlan(
      input(
        [
          cardOffer("big", 90_000, 100_000),
          cardOffer("chase-card", 50_000, 100_000, { institutionId: "chase" }),
        ],
        {
          history,
          rules: [fiveTwentyFour],
        },
      ),
    );
    expect(stepOf(plan, "chase-card")?.month).toBe(0);
    expect(stepOf(plan, "big")?.month).toBe(1);
    expect(stepOf(plan, "big")?.reasons.join(" ")).toMatch(/ineligible/);
  });

  it("schedules an offer when its lookback clears mid-plan", () => {
    const offer = cardOffer("csp", 75_000, 400_000, {
      eligibility: { lifetimeLimit: false, lookbackMonths: 24, lookbackScope: "product", notes: [] },
    });
    const history = [
      account("old-csp", "2024-12-01", {
        institutionId: "bank-x",
        productId: "csp",
        bonusReceivedAt: "2025-02-10",
      }),
    ];
    const step = stepOf(buildPlan(input([offer], { history })), "csp");
    expect(step?.month).toBe(3);
    expect(step?.applyDate).toBe("2027-02-10");
  });

  it("splits overlapping minimum spends that exceed organic spend", () => {
    const plan = buildPlan(
      input([cardOffer("a", 50_000, 300_000), cardOffer("b", 40_000, 450_000)], {
        monthlySpendCents: 200_000,
      }),
    );
    expect(stepOf(plan, "a")?.month).toBe(0);
    expect(stepOf(plan, "b")?.month).toBe(3);
    expect(stepOf(plan, "b")?.reasons.join(" ")).toMatch(/Scheduled after a/);
    expect(Math.max(...plan.months.map((m) => m.spendCents))).toBeLessThanOrEqual(200_000);
  });

  it("explains an offer whose minimum spend alone exceeds organic spend", () => {
    const plan = buildPlan(input([cardOffer("huge", 100_000, 2_400_000)], { monthlySpendCents: 200_000 }));
    expect(plan.steps).toEqual([]);
    expect(plan.skipped[0]).toMatchObject({ offerId: "huge", kind: "capacity" });
    expect(plan.skipped[0]?.reason).toMatch(/\$8,000\/month of monthly spend/);
  });

  it("respects the direct deposit split limit", () => {
    const offers = [bankOffer("a", 30_000, 100_000), bankOffer("b", 20_000, 100_000)];
    const one = buildPlan(input(offers, { directDepositSplits: 1 }));
    expect(one.steps.map((s) => s.month)).toEqual([0, 1]);
    const two = buildPlan(input(offers, { directDepositSplits: 2 }));
    expect(two.steps.map((s) => s.month)).toEqual([0, 0]);
    const none = buildPlan(input(offers, { directDepositSplits: 0 }));
    expect(none.steps).toEqual([]);
  });

  it("holds parked cash for the whole holding period", () => {
    const savings = (id: string) =>
      bankOffer(id, 10_000, 0, {
        productType: "savings",
        requirements: {
          ...noReq,
          minDepositCents: 1_000_000,
          minBalanceCents: 1_000_000,
          holdingPeriodDays: 90,
        },
      });
    const plan = buildPlan(input([savings("s1"), savings("s2")], { parkedCashCents: 1_500_000 }));
    expect(plan.steps.map((s) => [s.offerId, s.month])).toEqual([
      ["s1", 0],
      ["s2", 3],
    ]);
    expect(plan.months[1]?.parkedCents).toBe(1_000_000);
    expect(buildPlan(input([savings("s1")])).skipped[0]?.kind).toBe("capacity"); // no parked cash by default
  });

  it("keeps hard pulls within the 6- and 12-month limits", () => {
    const offers = [
      cardOffer("a", 30_000, 100_000),
      cardOffer("b", 20_000, 100_000),
      cardOffer("c", 10_000, 100_000),
    ];
    const plan = buildPlan(input(offers, { maxPullsPer6Months: 1, maxPullsPer12Months: 2 }));
    expect(plan.steps.map((s) => [s.offerId, s.month])).toEqual([
      ["a", 0],
      ["b", 6],
    ]);
    expect(plan.skipped[0]).toMatchObject({ offerId: "c", kind: "pull_limit" });
    // Bank accounts are soft pulls.
    const banks = buildPlan(
      input([bankOffer("x", 1_000, 1_000)], { maxPullsPer6Months: 0, maxPullsPer12Months: 0 }),
    );
    expect(banks.steps).toHaveLength(1);
  });

  it("counts recent history cards against the pull limit", () => {
    const plan = buildPlan(
      input([cardOffer("a", 30_000, 100_000)], {
        history: [account("h", "2026-09-01")],
        maxPullsPer6Months: 1,
      }),
    );
    expect(stepOf(plan, "a")?.month).toBe(4); // 2027-03-01: the 2026-09-01 pull has left the window
  });

  it("honors locks and exclusions", () => {
    const offers = [cardOffer("top", 90_000, 100_000), cardOffer("low", 10_000, 100_000)];
    const plan = buildPlan(input(offers, { excluded: ["top"], locked: [{ offerId: "low", month: 5 }] }));
    expect(plan.steps.map((s) => [s.offerId, s.month, s.locked])).toEqual([["low", 5, true]]);
    expect(plan.skipped).toMatchObject([{ offerId: "top", kind: "excluded" }]);

    const negative = cardOffer("fee", 10_000, 100_000);
    const forced = buildPlan(
      input([negative], { cards: [card("fee", 50_000)], locked: [{ offerId: "fee" }] }),
    );
    expect(forced.steps).toHaveLength(1);
    expect(forced.totalNetCents).toBe(-40_000);
    const unforced = buildPlan(input([negative], { cards: [card("fee", 50_000)] }));
    expect(unforced.skipped[0]?.kind).toBe("not_worth_it");
  });

  it("reports a lock that cannot fit", () => {
    const plan = buildPlan(
      input([cardOffer("a", 10_000, 100_000)], { monthlySpendCents: 0, locked: [{ offerId: "a" }] }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.skipped[0]?.kind).toBe("locked_infeasible");
  });

  it("does not schedule after expiry", () => {
    const offers = [
      cardOffer("big", 90_000, 300_000),
      cardOffer("soon", 40_000, 300_000, { expiresAt: "2026-11-20" }),
      cardOffer("gone", 40_000, 100_000, { expiresAt: "2026-09-30" }),
    ];
    const plan = buildPlan(input(offers, { monthlySpendCents: 100_000 }));
    // The expiring offer goes first; the bigger one waits until its spend window is free.
    expect(plan.steps.map((s) => `${s.offerId}@${s.month}`)).toEqual(["soon@0", "big@3"]);
    expect(plan.skipped.find((s) => s.offerId === "gone")?.kind).toBe("expired");
    // Locking the big one into month 0 leaves no room before "soon" expires.
    const locked = buildPlan(
      input(offers, { monthlySpendCents: 100_000, locked: [{ offerId: "big", month: 0 }] }),
    );
    expect(locked.skipped.find((s) => s.offerId === "soon")).toMatchObject({ kind: "outvalued" });
  });

  it("is deterministic regardless of input order", () => {
    const offers = [
      cardOffer("a", 50_000, 300_000),
      cardOffer("b", 50_000, 300_000),
      cardOffer("c", 40_000, 450_000),
      bankOffer("d", 20_000, 100_000),
      bankOffer("e", 20_000, 100_000),
    ];
    const opts = { monthlySpendCents: 200_000, directDepositSplits: 1, maxPullsPer6Months: 2 };
    const p1 = buildPlan(input(offers, opts));
    const p2 = buildPlan(input([...offers].reverse(), opts));
    expect(p2).toEqual(p1);
    expect(p1.steps.map((s) => `${s.offerId}@${s.month}`)).toEqual(["a@0", "b@0", "d@0", "e@1", "c@6"]);
  });
});

describe("plannerOfferValue", () => {
  it("subtracts the first-year fee unless waived and applies point values", () => {
    const o = cardOffer("csp", 75_000, 400_000, { bonusCurrencyId: "ur" });
    expect(plannerOfferValue(o, { card: card("csp", 9_500), centsPerPoint: 1.25 })).toMatchObject({
      bonusCents: 93_750,
      annualFeeCents: 9_500,
      netCents: 84_250,
    });
    expect(plannerOfferValue(o, { card: card("csp", 9_500, true), centsPerPoint: 1.25 }).netCents).toBe(
      93_750,
    );
  });

  it("keeps a fee-free account open through the early-closure window instead of paying the fee", () => {
    const o = bankOffer("wf", 32_500, 100_000, {
      monthlyFeeCents: 1_000,
      monthlyFeeWaivedByRequirements: true,
      earlyClosureFeeCents: 32_500,
      earlyClosureWindowDays: 180,
    });
    expect(plannerOfferValue(o, { card: null, centsPerPoint: 1 })).toMatchObject({
      netCents: 32_500,
      holdDays: 180,
    });
  });

  it("pays the closure fee when unwaived monthly fees would cost more", () => {
    const o = bankOffer("x", 30_000, 100_000, {
      monthlyFeeCents: 2_500,
      earlyClosureFeeCents: 2_000,
      earlyClosureWindowDays: 180,
    });
    // Close after 30 days: one month of fees ($25) + $20 closure fee, versus six months of fees ($150).
    expect(plannerOfferValue(o, { card: null, centsPerPoint: 1 })).toMatchObject({
      monthlyFeesCents: 2_500,
      earlyClosureFeeCents: 2_000,
      netCents: 25_500,
    });
  });
});
