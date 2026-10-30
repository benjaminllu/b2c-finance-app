import type { DepositProduct } from "../types";
import { DAYS_PER_MONTH, apyBpsAtBalance, projectGrowth } from "./interest";

export interface CdMaturity {
  termMonths: number;
  apyBps: number;
  interestCents: number;
  maturityValueCents: number;
}

export function cdMaturity(p: DepositProduct, principalCents: number): CdMaturity {
  if (p.cdTermMonths === null) throw new Error(`${p.id} is not a CD`);
  const g = projectGrowth(p, {
    principalCents,
    horizonDays: p.cdTermMonths * DAYS_PER_MONTH,
    ignoreFees: true,
  });
  return {
    termMonths: p.cdTermMonths,
    apyBps: Math.round(apyBpsAtBalance(p, principalCents)),
    interestCents: g.interestCents,
    maturityValueCents: g.endBalanceCents,
  };
}

export interface EarlyWithdrawalAnalysis {
  monthsElapsed: number;
  monthsRemaining: number;
  balanceNowCents: number;
  /** earlyWithdrawalPenaltyDays of interest: balance x APY x days / 365 (simple). May dip into principal. */
  penaltyCents: number;
  proceedsCents: number;
  stayValueAtMaturityCents: number;
  /** Proceeds reinvested at the alternative APY, valued on the CD's original maturity date. */
  breakValueAtMaturityCents: number;
  /** break - stay; positive means breaking pays off by the maturity date. */
  advantageOfBreakingCents: number;
  /** Months after breaking when the alternative overtakes staying (CD rate assumed to continue past maturity). Null if never. */
  breakEvenMonthsAfterBreak: number | null;
  /** The same point counted from the day the CD was opened. */
  breakEvenMonthFromOpen: number | null;
  explanation: string[];
}

const usd = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function analyzeEarlyWithdrawal(
  p: DepositProduct,
  input: { principalCents: number; monthsElapsed: number; alternativeApyBps: number },
): EarlyWithdrawalAnalysis {
  if (p.cdTermMonths === null) throw new Error(`${p.id} is not a CD`);
  const term = p.cdTermMonths;
  const elapsed = Math.min(Math.max(0, input.monthsElapsed), term);
  const remaining = term - elapsed;
  const P = input.principalCents;
  const cd = apyBpsAtBalance(p, P) / 10_000;
  const alt = input.alternativeApyBps / 10_000;

  const balanceNow = projectGrowth(p, {
    principalCents: P,
    horizonDays: elapsed * DAYS_PER_MONTH,
    ignoreFees: true,
  }).endBalanceCents;
  const penalty =
    remaining === 0 ? 0 : Math.round(balanceNow * cd * ((p.earlyWithdrawalPenaltyDays ?? 0) / 365));
  const proceeds = balanceNow - penalty;
  const stay = cdMaturity(p, P).maturityValueCents;
  const brk = Math.round(proceeds * (1 + alt) ** (remaining / 12));

  let breakEven: number | null = null;
  for (let m = 0; m <= 600 && alt > cd; m++) {
    if (proceeds * (1 + alt) ** (m / 12) >= balanceNow * (1 + cd) ** (m / 12)) {
      breakEven = m;
      break;
    }
  }

  const explanation = [
    `After ${elapsed} of ${term} months the CD is worth ${usd(balanceNow)}.`,
    `Breaking it costs ${p.earlyWithdrawalPenaltyDays ?? 0} days of interest: ${usd(balanceNow)} x ${(cd * 100).toFixed(2)}% x ${p.earlyWithdrawalPenaltyDays ?? 0} / 365 = ${usd(penalty)}, leaving ${usd(proceeds)}.`,
    `Waiting gives ${usd(stay)} at maturity. Moving ${usd(proceeds)} to ${(alt * 100).toFixed(2)}% APY gives ${usd(brk)} on the same date.`,
    breakEven === null
      ? "The alternative rate is not higher than the CD's, so breaking never pays off."
      : `The higher rate overtakes the penalty ${breakEven} months after breaking (assumes the CD rate continues past maturity).`,
  ];
  return {
    monthsElapsed: elapsed,
    monthsRemaining: remaining,
    balanceNowCents: balanceNow,
    penaltyCents: penalty,
    proceedsCents: proceeds,
    stayValueAtMaturityCents: stay,
    breakValueAtMaturityCents: brk,
    advantageOfBreakingCents: brk - stay,
    breakEvenMonthsAfterBreak: breakEven,
    breakEvenMonthFromOpen: breakEven === null ? null : elapsed + breakEven,
    explanation,
  };
}

/** YYYY-MM-DD plus whole months (UTC); day clamps to the end of a shorter month. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

export interface LadderRung {
  rung: number;
  targetTermMonths: number;
  /** Null when no CD fits this rung. */
  product: DepositProduct | null;
  termMonths: number | null;
  amountCents: number;
  apyBps: number | null;
  maturityDate: string | null;
  interestCents: number;
  maturityValueCents: number;
  note: string | null;
}

export interface CdLadder {
  rungs: LadderRung[];
  totalInterestCents: number;
  totalMaturityValueCents: number;
}

/**
 * Rung i targets a term of spacingMonths x (i + 1). Each rung takes the CD whose term is closest to the target
 * (ties: higher APY) that the rung's amount can open. The amount is split evenly; leftover cents go to the first rungs.
 */
export function buildCdLadder(input: {
  amountCents: number;
  rungs: number;
  spacingMonths: number;
  /** YYYY-MM-DD the ladder is opened. */
  startDate: string;
  cds: DepositProduct[];
}): CdLadder {
  const { amountCents, rungs: n, spacingMonths, startDate } = input;
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`rungs must be a positive integer, got ${n}`);
  const cds = input.cds.filter((c) => c.type === "cd" && c.cdTermMonths !== null);
  const base = Math.floor(amountCents / n);
  const extra = amountCents - base * n;
  const out: LadderRung[] = [];
  for (let i = 0; i < n; i++) {
    const amount = base + (i < extra ? 1 : 0);
    const target = spacingMonths * (i + 1);
    const best = cds
      .filter((c) => c.minOpenCents <= amount)
      .map((c) => ({
        c,
        dist: Math.abs((c.cdTermMonths as number) - target),
        apy: apyBpsAtBalance(c, amount),
      }))
      .sort((a, b) => a.dist - b.dist || b.apy - a.apy || a.c.id.localeCompare(b.c.id))[0];
    if (!best) {
      out.push({
        rung: i + 1,
        targetTermMonths: target,
        product: null,
        termMonths: null,
        amountCents: amount,
        apyBps: null,
        maturityDate: null,
        interestCents: 0,
        maturityValueCents: amount,
        note: "No CD available that this amount can open.",
      });
      continue;
    }
    const m = cdMaturity(best.c, amount);
    out.push({
      rung: i + 1,
      targetTermMonths: target,
      product: best.c,
      termMonths: m.termMonths,
      amountCents: amount,
      apyBps: m.apyBps,
      maturityDate: addMonthsIso(startDate, m.termMonths),
      interestCents: m.interestCents,
      maturityValueCents: m.maturityValueCents,
      note:
        best.dist === 0 ? null : `No ${target}-month CD; using the closest term (${m.termMonths} months).`,
    });
  }
  return {
    rungs: out,
    totalInterestCents: out.reduce((s, r) => s + r.interestCents, 0),
    totalMaturityValueCents: out.reduce((s, r) => s + r.maturityValueCents, 0),
  };
}
