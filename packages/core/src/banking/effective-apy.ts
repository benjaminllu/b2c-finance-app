import type { BonusOffer, DepositProduct, FeeWaiver } from "../types";
import { DAYS_PER_MONTH, apyBpsAtBalance, projectGrowth } from "./interest";

export type CashOption =
  | { kind: "deposit"; product: DepositProduct }
  | { kind: "bonus"; offer: BonusOffer; product: DepositProduct | null };

export interface EffectiveApyInput {
  principalCents: number;
  horizonDays: number;
  metWaivers?: readonly FeeWaiver["kind"][];
  /** Bonuses only: where principal above the required cash sits (e.g. the best HYSA). Null = it earns nothing. */
  excessCashProduct?: DepositProduct | null;
}

export interface LineItem {
  key: "interest" | "bonus" | "monthly_fees" | "early_closure_fee";
  label: string;
  /** Signed cents: income positive, costs negative. */
  cents: number;
}

export interface EffectiveApyResult {
  feasible: boolean;
  infeasibleReason: string | null;
  /** Null when no cash needs to be parked (APY is undefined) or the option is infeasible. */
  effectiveApyBps: number | null;
  /** Why effectiveApyBps is null, else null. */
  apyNote: string | null;
  /** What $1,000 earns per year at the effective APY, in cents (= effective APY in bps x 10). */
  dollarsPerThousandPerYearCents: number | null;
  /** Sum of breakdown over the horizon. */
  netEarningsCents: number;
  breakdown: LineItem[];
  explanation: string[];
}

const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (frac: number) => `${(frac * 100).toFixed(2)}%`;

export function infeasibleResult(reason: string): EffectiveApyResult {
  return {
    feasible: false,
    infeasibleReason: reason,
    effectiveApyBps: null,
    apyNote: null,
    dollarsPerThousandPerYearCents: null,
    netEarningsCents: 0,
    breakdown: [],
    explanation: [reason],
  };
}

function finish(
  breakdown: LineItem[],
  apy: number | null,
  apyNote: string | null,
  explanation: string[],
): EffectiveApyResult {
  const net = breakdown.reduce((s, i) => s + i.cents, 0);
  return {
    feasible: true,
    infeasibleReason: null,
    effectiveApyBps: apy === null ? null : Math.round(apy * 10_000),
    apyNote,
    dollarsPerThousandPerYearCents: apy === null ? null : Math.round(apy * 100_000),
    netEarningsCents: net,
    breakdown,
    explanation,
  };
}

const monthsIn = (days: number) => Math.floor(days / DAYS_PER_MONTH + 1e-9);

/**
 * The one scale every cash option is compared on.
 *
 * Deposits: effective APY is the compounded annualized return of (interest - fees) on the principal:
 *   (1 + net / principal) ^ (365 / days) - 1.
 * Bonuses: SIMPLE annualization, because it is easier to explain than compounding:
 *   net / cashTiedUp x 365 / holdDays
 * where cashTiedUp = the required deposit/balance and holdDays = the holding period. The net dollars over the
 * horizon assume the whole principal sits in the account (earning the linked product's rate, or 0% if unknown).
 */
export function effectiveApy(option: CashOption, input: EffectiveApyInput): EffectiveApyResult {
  if (!(input.horizonDays > 0)) return infeasibleResult("The lock-up period must be longer than zero days.");
  if (!(input.principalCents >= 0)) return infeasibleResult("The amount can't be negative.");
  return option.kind === "deposit"
    ? depositApy(option.product, input)
    : bonusApy(option.offer, option.product, input);
}

function depositApy(p: DepositProduct, input: EffectiveApyInput): EffectiveApyResult {
  const { principalCents: P, horizonDays: days } = input;
  if (P < p.minOpenCents) {
    return infeasibleResult(`Needs ${usd(p.minOpenCents)} to open; you entered ${usd(P)}.`);
  }
  if (p.cdTermMonths !== null && days < p.cdTermMonths * DAYS_PER_MONTH - 1e-9) {
    return infeasibleResult(
      `The CD term is ${p.cdTermMonths} months, longer than your ${Math.round(days / DAYS_PER_MONTH)}-month lock-up.`,
    );
  }
  const g = projectGrowth(p, { principalCents: P, horizonDays: days, metWaivers: input.metWaivers });
  const rate = apyBpsAtBalance(p, P) / 10_000;
  const breakdown: LineItem[] = [{ key: "interest", label: "Interest earned", cents: g.interestCents }];
  if (g.feesCents > 0) breakdown.push({ key: "monthly_fees", label: "Monthly fees", cents: -g.feesCents });
  const net = g.interestCents - g.feesCents;
  const explanation = [
    p.tierMode === "blended"
      ? `Rate: each slice of your ${usd(P)} earns its own tier, blending to ${pct(rate)} APY.`
      : `Rate: ${usd(P)} falls in a tier paying ${pct(rate)} APY on the whole balance.`,
  ];
  if (rate === 0 && P < p.minBalanceForApyCents) {
    explanation.push(`You need ${usd(p.minBalanceForApyCents)} to earn the APY, so this earns nothing.`);
  }
  explanation.push(
    `Interest over ${Math.round(days)} days, compounded ${p.compounding}, starting from ${usd(P)}: ${usd(g.interestCents)}.`,
  );
  if (g.feesCents > 0) explanation.push(`Monthly fees not waived: ${usd(g.feesCents)}.`);
  if (p.cdTermMonths !== null && days > p.cdTermMonths * DAYS_PER_MONTH + 1) {
    explanation.push(
      `Your lock-up outlasts the ${p.cdTermMonths}-month term; assumes renewal at the same rate.`,
    );
  }
  if (P === 0) return finish(breakdown, null, "No cash is parked, so APY is undefined.", explanation);
  const apy = (1 + net / P) ** (365 / days) - 1;
  explanation.push(
    `Effective APY = (1 + ${usd(net)} / ${usd(P)}) ^ (365 / ${Math.round(days)}) - 1 = ${pct(apy)}.`,
  );
  return finish(breakdown, apy, null, explanation);
}

function bonusApy(o: BonusOffer, p: DepositProduct | null, input: EffectiveApyInput): EffectiveApyResult {
  const { principalCents: P, horizonDays: days } = input;
  if (o.productType === "credit_card") return infeasibleResult("Credit card offers are not cash options.");
  if (o.bonusCurrencyId !== "usd") return infeasibleResult("This bonus is paid in points, not dollars.");
  const r = o.requirements;
  const cash = Math.max(r.minDepositCents ?? 0, r.minBalanceCents ?? 0);
  if (cash > P) {
    return infeasibleResult(`Needs ${usd(cash)} parked; you entered ${usd(P)}.`);
  }
  const holdDays = cash > 0 ? (r.holdingPeriodDays ?? o.earlyClosureWindowDays ?? 30) : 0;
  if (holdDays > days) {
    return infeasibleResult(`Cash must stay ${holdDays} days; your lock-up is ${Math.round(days)} days.`);
  }

  const fee = o.monthlyFeeWaivedByRequirements ? 0 : o.monthlyFeeCents;
  const closure = (d: number) =>
    o.earlyClosureFeeCents > 0 && o.earlyClosureWindowDays !== null && d < o.earlyClosureWindowDays
      ? o.earlyClosureFeeCents
      : 0;
  const interestOn = (cents: number, d: number) =>
    p ? projectGrowth(p, { principalCents: cents, horizonDays: d, ignoreFees: true }).interestCents : 0;

  // With a required balance, only that cash sits in the bonus account; the rest earns excessCashProduct's rate.
  const sweep = cash > 0 ? (input.excessCashProduct ?? null) : null;
  const inAccount = sweep ? cash : P;
  const excessInterest = sweep
    ? projectGrowth(sweep, { principalCents: P - cash, horizonDays: days, ignoreFees: true }).interestCents
    : 0;
  const interest = interestOn(inAccount, days);
  const fees = fee * monthsIn(days);
  const close = closure(days);
  const breakdown: LineItem[] = [{ key: "bonus", label: "Sign-up bonus", cents: o.bonusValue }];
  if (p) breakdown.push({ key: "interest", label: "Interest on the account", cents: interest });
  if (sweep && P > cash) {
    breakdown.push({
      key: "interest",
      label: `Interest on the rest at ${sweep.name}`,
      cents: excessInterest,
    });
  }
  if (fees > 0) breakdown.push({ key: "monthly_fees", label: "Monthly fees not waived", cents: -fees });
  if (close > 0) breakdown.push({ key: "early_closure_fee", label: "Early closure fee", cents: -close });

  const explanation = [
    `Bonus: ${usd(o.bonusValue)}.`,
    p
      ? `Interest on ${usd(inAccount)} for ${Math.round(days)} days at the account's rate: ${usd(interest)}.`
      : `The account's rate is unknown, so no interest is counted on the ${usd(inAccount)} in it.`,
  ];
  if (sweep && P > cash) {
    explanation.push(
      `The other ${usd(P - cash)} stays in ${sweep.name} for ${Math.round(days)} days: ${usd(excessInterest)}.`,
    );
  }
  if (fees > 0)
    explanation.push(`The ${usd(o.monthlyFeeCents)} monthly fee is not waived by the requirements.`);
  if (close > 0) {
    explanation.push(
      `You close before day ${o.earlyClosureWindowDays}, so an early closure fee of ${usd(close)} applies.`,
    );
  }
  if (cash === 0) {
    return finish(
      breakdown,
      null,
      "No cash needs to be parked (the requirements are not balance-based), so APY is undefined.",
      explanation,
    );
  }

  const heldNet = o.bonusValue + interestOn(cash, holdDays) - fee * monthsIn(holdDays) - closure(holdDays);
  const apy = (heldNet / cash) * (365 / holdDays);
  explanation.push(
    `Cash tied up: ${usd(cash)} for ${holdDays} days. Net over that period: ${usd(heldNet)}.`,
    `Effective APY (simple annualization) = ${usd(heldNet)} / ${usd(cash)} x 365 / ${holdDays} = ${pct(apy)}.`,
  );
  return finish(breakdown, apy, null, explanation);
}
