import { describe, expect, it } from "vitest";
import type { BonusOffer, DepositProduct } from "../types";
import {
  analyzeEarlyWithdrawal,
  apyBpsAtBalance,
  buildCdLadder,
  cdMaturity,
  effectiveApy,
  projectGrowth,
  rankCashOptions,
} from "./index";

const prov = { sourceUrl: "https://example.com", lastVerifiedAt: "2026-10-30T00:00:00Z", isSample: true };

function product(o: Partial<DepositProduct> = {}): DepositProduct {
  return {
    id: "p",
    bankId: "b",
    name: "P",
    type: "savings",
    apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 500 }],
    tierMode: "whole_balance",
    compounding: "monthly",
    minOpenCents: 0,
    minBalanceForApyCents: 0,
    monthlyFeeCents: 0,
    feeWaivers: [],
    cdTermMonths: null,
    earlyWithdrawalPenaltyDays: null,
    affiliateUrl: null,
    isAffiliate: false,
    ...prov,
    ...o,
  };
}

function cd(id: string, months: number, apyBps: number): DepositProduct {
  return product({
    id,
    type: "cd",
    cdTermMonths: months,
    earlyWithdrawalPenaltyDays: 90,
    minOpenCents: 50_000,
    apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps }],
  });
}

function offer(o: Partial<BonusOffer> = {}): BonusOffer {
  return {
    id: "o",
    productType: "checking",
    institutionId: "b",
    cardId: null,
    depositProductId: null,
    title: "T",
    bonusValue: 30_000,
    bonusCurrencyId: "usd",
    requirements: {
      minSpendCents: null,
      spendWindowDays: null,
      directDepositTotalCents: null,
      directDepositCount: null,
      directDepositWindowDays: null,
      minDepositCents: 1_000_000,
      minBalanceCents: null,
      holdingPeriodDays: 90,
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
  };
}

describe("tiers", () => {
  const tiers = [
    { minBalanceCents: 0, maxBalanceCents: 999_999, apyBps: 200 },
    { minBalanceCents: 1_000_000, maxBalanceCents: null, apyBps: 450 },
  ];
  it("whole_balance: the tier the balance lands in pays on all of it", () => {
    const p = product({ apyTiers: tiers });
    expect(apyBpsAtBalance(p, 500_000)).toBe(200);
    expect(apyBpsAtBalance(p, 2_000_000)).toBe(450);
  });
  it("blended: slices earn their own tier", () => {
    // $20,000: $10,000 at 2.00% + $10,000 at 4.50% = (1e6*200 + 1e6*450) / 2e6 = 325 bps
    expect(apyBpsAtBalance(product({ apyTiers: tiers, tierMode: "blended" }), 2_000_000)).toBe(325);
  });
  it("pays nothing below the minimum balance to earn APY", () => {
    expect(apyBpsAtBalance(product({ minBalanceForApyCents: 100_000 }), 99_999)).toBe(0);
  });
});

describe("compounding", () => {
  it("monthly and daily agree over a full year", () => {
    // $1,000 at 5% APY for 365 days = 100000 x 0.05 = 5000
    expect(projectGrowth(product(), { principalCents: 100_000, horizonDays: 365 }).interestCents).toBe(5000);
    expect(
      projectGrowth(product({ compounding: "daily" }), { principalCents: 100_000, horizonDays: 365 })
        .interestCents,
    ).toBe(5000);
  });
  it("differ inside a partial month", () => {
    // $100,000, 15 days. daily: 1e7 x (1.05^(15/365) - 1) = 20071
    // monthly: 1e7 x (1.05^(1/12) - 1) x 15/(365/12) = 20092 (simple within the month)
    const input = { principalCents: 10_000_000, horizonDays: 15 };
    expect(projectGrowth(product({ compounding: "daily" }), input).interestCents).toBe(20_071);
    expect(projectGrowth(product(), input).interestCents).toBe(20_092);
  });
  it("returns a month-by-month series", () => {
    const g = projectGrowth(product(), { principalCents: 100_000, horizonDays: 365 });
    expect(g.points).toHaveLength(13);
    expect(g.points[12]?.balanceCents).toBe(105_000);
    expect(g.endBalanceCents).toBe(105_000);
  });
});

describe("fees and waivers", () => {
  const fee = product({
    apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 0 }],
    monthlyFeeCents: 1200,
    feeWaivers: [
      { kind: "min_daily_balance", thresholdCents: 500_000, count: null, description: "$5,000" },
      { kind: "direct_deposit", thresholdCents: null, count: null, description: "DD" },
    ],
  });
  it("charges 12 x $12 when no waiver applies", () => {
    const r = projectGrowth(fee, { principalCents: 100_000, horizonDays: 365 });
    expect(r.feesCents).toBe(14_400); // 12 x 1200
    expect(r.endBalanceCents).toBe(85_600);
  });
  it("waives on a balance threshold or a stated waiver", () => {
    expect(projectGrowth(fee, { principalCents: 600_000, horizonDays: 365 }).feesCents).toBe(0);
    expect(
      projectGrowth(fee, { principalCents: 100_000, horizonDays: 365, metWaivers: ["direct_deposit"] })
        .feesCents,
    ).toBe(0);
  });
  it("effectiveApy nets fees: -14400 / 100000 = -14.4% over a year", () => {
    const r = effectiveApy({ kind: "deposit", product: fee }, { principalCents: 100_000, horizonDays: 365 });
    expect(r.netEarningsCents).toBe(-14_400);
    expect(r.effectiveApyBps).toBe(-1440);
    expect(r.breakdown.reduce((s, i) => s + i.cents, 0)).toBe(r.netEarningsCents);
  });
});

describe("effectiveApy deposits", () => {
  it("5% on $1,000 for a year", () => {
    const r = effectiveApy(
      { kind: "deposit", product: product() },
      { principalCents: 100_000, horizonDays: 365 },
    );
    expect(r.netEarningsCents).toBe(5000);
    expect(r.effectiveApyBps).toBe(500);
    expect(r.dollarsPerThousandPerYearCents).toBe(5000);
  });
  it("is infeasible below the opening minimum or when the CD outlasts the horizon", () => {
    const hy = effectiveApy(
      { kind: "deposit", product: product({ minOpenCents: 100_000 }) },
      { principalCents: 50_000, horizonDays: 365 },
    );
    expect(hy.feasible).toBe(false);
    expect(hy.infeasibleReason).toMatch(/to open/);
    const c = effectiveApy(
      { kind: "deposit", product: cd("c", 24, 500) },
      { principalCents: 100_000, horizonDays: 365 },
    );
    expect(c.feasible).toBe(false);
    expect(c.infeasibleReason).toMatch(/24 months/);
  });
});

describe("effectiveApy bonuses", () => {
  it("annualizes simply over the holding period, with an early closure fee", () => {
    // $300 bonus, $10,000 held 90 days, $25 closure fee since 90 < 180-day window.
    // net = 30000 - 2500 = 27500; APY = 27500 / 1e6 x 365 / 90 = 11.1528% -> 1115 bps
    const o = offer({ earlyClosureFeeCents: 2500, earlyClosureWindowDays: 180 });
    const r = effectiveApy(
      { kind: "bonus", offer: o, product: null },
      { principalCents: 1_000_000, horizonDays: 90 },
    );
    expect(r.netEarningsCents).toBe(27_500);
    expect(r.effectiveApyBps).toBe(1115);
    expect(r.breakdown.map((i) => i.cents)).toEqual([30_000, -2500]);
  });
  it("has no APY when no cash is parked", () => {
    const o = offer({
      bonusValue: 40_000,
      requirements: {
        ...offer().requirements,
        minDepositCents: null,
        holdingPeriodDays: null,
        directDepositCount: 2,
      },
    });
    const r = effectiveApy(
      { kind: "bonus", offer: o, product: null },
      { principalCents: 0, horizonDays: 90 },
    );
    expect(r.effectiveApyBps).toBeNull();
    expect(r.apyNote).toMatch(/undefined/);
    expect(r.netEarningsCents).toBe(40_000);
  });
  it("adds the linked product's interest over the horizon", () => {
    // $10,000 at 5% for a year = 50000 interest, plus 30000 bonus
    const r = effectiveApy(
      { kind: "bonus", offer: offer(), product: product() },
      { principalCents: 1_000_000, horizonDays: 365 },
    );
    expect(r.netEarningsCents).toBe(80_000);
  });
  it("puts cash above the requirement in the excess-cash product", () => {
    // $30,000 total, $10,000 required in a 0% checking; $20,000 at 5% for a year = 100000.
    // net = 30000 bonus + 0 + 100000 = 130000
    const checking = product({ apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 0 }] });
    const r = effectiveApy(
      { kind: "bonus", offer: offer(), product: checking },
      { principalCents: 3_000_000, horizonDays: 365, excessCashProduct: product({ name: "HYSA" }) },
    );
    expect(r.netEarningsCents).toBe(130_000);
    expect(r.breakdown.map((i) => i.cents)).toEqual([30_000, 0, 100_000]);
    // Without it, the whole $30,000 sits in the 0% checking.
    const bare = effectiveApy(
      { kind: "bonus", offer: offer(), product: checking },
      { principalCents: 3_000_000, horizonDays: 365 },
    );
    expect(bare.netEarningsCents).toBe(30_000);
  });
  it("is infeasible when the cash is short, the hold outlasts the horizon, or it pays in points", () => {
    const run = (o: BonusOffer, principalCents: number, horizonDays: number) =>
      effectiveApy({ kind: "bonus", offer: o, product: null }, { principalCents, horizonDays });
    expect(run(offer(), 500_000, 365).feasible).toBe(false);
    expect(run(offer(), 1_000_000, 30).feasible).toBe(false);
    expect(run(offer({ bonusCurrencyId: "chase-ur" }), 1_000_000, 365).feasible).toBe(false);
  });
});

describe("CDs", () => {
  const c = cd("c12", 12, 500);
  it("maturity value", () => {
    // $10,000 at 5% APY, 12 months = 1,000,000 x 1.05 = 1,050,000
    expect(cdMaturity(c, 1_000_000).maturityValueCents).toBe(1_050_000);
  });
  it("early withdrawal: penalty and break-even", () => {
    // Month 6: 1e6 x 1.05^0.5 = 1,024,695. Penalty = 1,024,695 x 5% x 90/365 = 12,633 -> proceeds 1,012,062.
    // Alternative 6% for the remaining 6 months: 1,012,062 x 1.06^0.5 = 1,041,982 vs 1,050,000 waiting.
    // Break-even m: (1.06/1.05)^(m/12) >= 1,024,695/1,012,062 -> m >= 15.7 -> 16 months after breaking.
    const a = analyzeEarlyWithdrawal(c, {
      principalCents: 1_000_000,
      monthsElapsed: 6,
      alternativeApyBps: 600,
    });
    expect(a.balanceNowCents).toBe(1_024_695);
    expect(a.penaltyCents).toBe(12_633);
    expect(a.proceedsCents).toBe(1_012_062);
    expect(a.breakValueAtMaturityCents).toBe(1_041_982);
    expect(a.advantageOfBreakingCents).toBe(1_041_982 - 1_050_000);
    expect(a.breakEvenMonthsAfterBreak).toBe(16);
    expect(a.breakEvenMonthFromOpen).toBe(22);
  });
  it("never breaks even at a lower rate", () => {
    expect(
      analyzeEarlyWithdrawal(c, { principalCents: 1_000_000, monthsElapsed: 6, alternativeApyBps: 400 })
        .breakEvenMonthsAfterBreak,
    ).toBeNull();
  });
});

describe("CD ladder", () => {
  it("builds rungs with maturity dates and values", () => {
    // $30,000 / 3 rungs = $10,000 each. 3 months at 4%: 1e6 x 1.04^0.25 = 1,009,853;
    // 6 months at 4.5%: 1e6 x 1.045^0.5 = 1,022,252; 9 months at 5%: 1e6 x 1.05^0.75 = 1,037,270.
    const l = buildCdLadder({
      amountCents: 3_000_000,
      rungs: 3,
      spacingMonths: 3,
      startDate: "2026-11-30",
      cds: [cd("c3", 3, 400), cd("c6", 6, 450), cd("c9", 9, 500), cd("c12", 12, 600)],
    });
    expect(l.rungs.map((r) => r.maturityValueCents)).toEqual([1_009_853, 1_022_252, 1_037_270]);
    expect(l.rungs.map((r) => r.maturityDate)).toEqual(["2027-02-28", "2027-05-30", "2027-08-30"]);
    expect(l.totalMaturityValueCents).toBe(3_069_375);
    expect(l.totalInterestCents).toBe(69_375);
  });
  it("uses the closest term when an exact one is missing, and reports a rung with no CD", () => {
    const l = buildCdLadder({
      amountCents: 200_000,
      rungs: 2,
      spacingMonths: 6,
      startDate: "2026-01-15",
      cds: [cd("c12", 12, 500)],
    });
    expect(l.rungs[0]?.product?.id).toBe("c12");
    expect(l.rungs[0]?.note).toMatch(/closest/);
    const none = buildCdLadder({
      amountCents: 10_000,
      rungs: 1,
      spacingMonths: 6,
      startDate: "2026-01-15",
      cds: [cd("c", 6, 500)],
    });
    expect(none.rungs[0]?.product).toBeNull();
  });
});

describe("rankCashOptions", () => {
  it("ranks by net dollars, excludes infeasible and expired options with reasons", () => {
    const hy = product({ id: "hy" });
    const lowHy = product({
      id: "low",
      apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 100 }],
    });
    const r = rankCashOptions({
      products: [lowHy, hy, cd("c24", 24, 600)],
      offers: [
        offer({ id: "big", bonusValue: 80_000 }),
        offer({ id: "old", expiresAt: "2026-01-01" }),
        offer({ id: "pts", bonusCurrencyId: "chase-ur" }),
      ],
      amountCents: 1_000_000,
      horizonDays: 365,
      now: new Date("2026-10-30T00:00:00Z"),
    });
    // big: 80000 (no product rate); hy: 50000; low: 10000
    expect(r.ranked.map((o) => o.id)).toEqual(["big", "hy", "low"]);
    expect(r.excluded.map((o) => o.id).sort()).toEqual(["c24", "old", "pts"]);
    expect(r.excluded.every((o) => o.result.infeasibleReason)).toBe(true);
  });
});
