import { describe, expect, it } from "vitest";
import type { BonusOffer, DepositProduct } from "../types";
import {
  filterOffers,
  offerNetValue,
  offerRoiBps,
  parkedCashComparison,
  sortOffers,
  trackerStatus,
  type OfferView,
} from "./index";

const req = {
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
const mk = (o: Partial<BonusOffer>): BonusOffer => ({
  id: "o",
  productType: "checking",
  institutionId: "bank",
  cardId: null,
  depositProductId: null,
  title: "t",
  bonusValue: 30000,
  bonusCurrencyId: "usd",
  requirements: req,
  monthlyFeeCents: 0,
  monthlyFeeWaivedByRequirements: false,
  eligibility: { lifetimeLimit: false, lookbackMonths: null, lookbackScope: "product", notes: [] },
  eligibleStates: null,
  earlyClosureFeeCents: 0,
  earlyClosureWindowDays: null,
  expiresAt: null,
  sourceUrl: "https://example.com",
  lastVerifiedAt: "2026-10-30T00:00:00Z",
  isSample: true,
  affiliateUrl: null,
  isAffiliate: false,
  ...o,
});
const ctx = { currencies: [{ id: "ur", defaultCentsPerPoint: 1.25 }] };

describe("offerNetValue", () => {
  it("charges unwaived monthly fees over the holding period (90 days = 2 full months)", () => {
    const r = offerNetValue(
      mk({ monthlyFeeCents: 1200, requirements: { ...req, holdingPeriodDays: 90 } }),
      ctx,
    );
    expect(r.netCents).toBe(30000 - 2400);
  });
  it("skips waived fees", () => {
    const o = mk({
      monthlyFeeCents: 1200,
      monthlyFeeWaivedByRequirements: true,
      requirements: { ...req, holdingPeriodDays: 90 },
    });
    expect(offerNetValue(o, ctx).netCents).toBe(30000);
  });
  it("uses the longer of holding period and closure window", () => {
    const o = mk({
      monthlyFeeCents: 1000,
      earlyClosureWindowDays: 183,
      requirements: { ...req, holdingPeriodDays: 30 },
    });
    expect(offerNetValue(o, ctx).netCents).toBe(30000 - 6000);
  });
  it("counts the closure fee only when closing inside the window", () => {
    const o = mk({ earlyClosureFeeCents: 5000, earlyClosureWindowDays: 90 });
    expect(offerNetValue(o, ctx).netCents).toBe(30000);
    expect(offerNetValue(o, { ...ctx, keepOpenDays: 60 }).netCents).toBe(25000);
  });
  it("values points and subtracts the first-year card fee; overrides win", () => {
    const o = mk({ productType: "credit_card", cardId: "c", bonusValue: 75000, bonusCurrencyId: "ur" });
    const cards = [{ id: "c", annualFeeCents: 9500, firstYearFeeWaived: false }];
    expect(offerNetValue(o, { ...ctx, cards }).netCents).toBe(93750 - 9500);
    expect(offerNetValue(o, { ...ctx, cards, centsPerPoint: { ur: 2 } }).netCents).toBe(150000 - 9500);
    expect(offerNetValue(o, { ...ctx, cards: [{ ...cards[0]!, firstYearFeeWaived: true }] }).netCents).toBe(
      93750,
    );
  });
});

const hysa = {
  id: "hysa",
  bankId: "b",
  name: "HYSA",
  type: "savings",
  apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 400 }],
  tierMode: "whole_balance",
  compounding: "daily",
  minOpenCents: 0,
  minBalanceForApyCents: 0,
  monthlyFeeCents: 0,
  feeWaivers: [],
  cdTermMonths: null,
  earlyWithdrawalPenaltyDays: null,
  sourceUrl: "https://example.com",
  lastVerifiedAt: "2026-10-30T00:00:00Z",
  isSample: true,
  affiliateUrl: null,
  isAffiliate: false,
} as DepositProduct;

describe("parkedCashComparison", () => {
  it("annualizes 250 on 5,000 over 90 days to 20.28% and compares with a 4% HYSA", () => {
    const o = mk({
      bonusValue: 25000,
      requirements: { ...req, minDepositCents: 500000, holdingPeriodDays: 90 },
    });
    const c = parkedCashComparison(o, null, [hysa])!;
    // 25000 / 500000 x 365 / 90 = 0.20278
    expect(c.bonusApyBps).toBe(2028);
    expect(c.alternative?.apyBps).toBe(400);
    expect(c.summary).toContain("20.28% APY");
  });
  it("is null when no cash is parked", () => {
    expect(parkedCashComparison(mk({}), null, [hysa])).toBeNull();
  });
});

const view = (id: string, net: number, o: Partial<BonusOffer> = {}): OfferView => ({
  offer: mk({ id, ...o }),
  bonusCents: net,
  netCents: net,
});

describe("filter and sort", () => {
  const today = "2026-10-30";
  const views = [
    view("b", 100),
    view("a", 100, { expiresAt: "2026-11-05" }),
    view("old", 900, { expiresAt: "2026-10-29" }),
    view("card", 500, { productType: "credit_card", cardId: "c" }),
    view("tx", 300, { eligibleStates: ["TX"], requirements: { ...req, directDepositTotalCents: 100000 } }),
  ];
  it("always hides expired and splits tabs", () => {
    expect(
      filterOffers(views, { tab: "bank" }, today)
        .map((v) => v.offer.id)
        .sort(),
    ).toEqual(["a", "b", "tx"]);
    expect(filterOffers(views, { tab: "cards" }, today).map((v) => v.offer.id)).toEqual(["card"]);
  });
  it("filters by state, direct deposit, expiring soon", () => {
    expect(
      filterOffers(views, { tab: "bank", state: "CA" }, today)
        .map((v) => v.offer.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(filterOffers(views, { tab: "bank", directDeposit: "yes" }, today).map((v) => v.offer.id)).toEqual([
      "tx",
    ]);
    expect(filterOffers(views, { tab: "bank", expiringSoon: true }, today).map((v) => v.offer.id)).toEqual([
      "a",
    ]);
  });
  it("hides ineligible", () => {
    const v = [
      { ...view("x", 1), eligibility: { eligible: false, issues: [], eligibleFrom: null } },
      view("y", 1),
    ];
    expect(filterOffers(v, { tab: "bank", hideIneligible: true }, today).map((x) => x.offer.id)).toEqual([
      "y",
    ]);
  });
  it("sorts with deterministic id ties", () => {
    expect(sortOffers(views, "net").map((v) => v.offer.id)).toEqual(["old", "card", "tx", "a", "b"]);
    expect(sortOffers(views, "deadline").map((v) => v.offer.id)).toEqual(["old", "a", "b", "card", "tx"]);
  });
  it("roi is net over parked cash", () => {
    expect(offerRoiBps(mk({ requirements: { ...req, minDepositCents: 100000 } }), 5000)).toBe(500);
    expect(offerRoiBps(mk({}), 5000)).toBeNull();
  });
});

describe("trackerStatus", () => {
  it("computes the deadline and reminder from applied date + window", () => {
    const o = mk({ requirements: { ...req, minSpendCents: 400000, spendWindowDays: 90 } });
    const s = trackerStatus(
      o,
      { offerId: "o", appliedAt: "2026-10-01", spentCents: 280000, directDepositCents: 0 },
      "2026-10-30",
    );
    expect(s.deadline).toBe("2026-12-30");
    expect(s.progress[0]?.leftCents).toBe(120000);
    expect(s.reminders[0]).toBe("$1,200 left for minimum spend in 61 days.");
  });
});
