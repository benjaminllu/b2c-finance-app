import { DAYS_PER_MONTH } from "../cards";
import { addDays, addMonths, checkEligibility, type EligibilityIssue } from "../eligibility";
import type {
  AccountRecord,
  BonusOffer,
  CreditCard,
  EligibilityRule,
  IsoDate,
  RewardCurrency,
} from "../types";
import { plannerOfferValue, requirementDays, type OfferValue } from "./value";

export interface PlannerLock {
  offerId: string;
  /** 0-based plan month the offer must open in; null/undefined = any month. */
  month?: number | null;
}

export interface PlannerInput {
  history: readonly AccountRecord[];
  /** Organic spend per month that can go toward card minimum spends. */
  monthlySpendCents: number;
  /** Direct deposit per month that can be routed to new accounts. */
  directDepositMonthlyCents: number;
  /** How many accounts the direct deposit can be split across at once. */
  directDepositSplits: number;
  /** Cash that can sit in new accounts for balance/new-money requirements. Default 0. */
  parkedCashCents?: number;
  maxPullsPer6Months: number;
  maxPullsPer12Months: number;
  horizonMonths: number;
  /** First possible application date; later months start on the 1st. */
  startDate: IsoDate;
  offers: readonly BonusOffer[];
  rules: readonly EligibilityRule[];
  cards: readonly CreditCard[];
  currencies: readonly Pick<RewardCurrency, "id" | "defaultCentsPerPoint">[];
  /** Cents per point by currency id. */
  centsPerPointOverrides?: Readonly<Record<string, number>>;
  locked?: readonly PlannerLock[];
  excluded?: readonly string[];
  /** Beam width; default 8. */
  beamWidth?: number;
}

export type LoadKind = "spend" | "dd" | "parked";

/** A requirement spread evenly over consecutive plan months. */
export interface RequirementLoad {
  kind: LoadKind;
  fromMonth: number;
  months: number;
  totalCents: number;
  /** Per-month share (the full balance for parked cash), rounded for display; checks use the exact share. */
  monthlyCents: number;
}

export interface PlanStep {
  offerId: string;
  title: string;
  institutionId: string;
  productType: BonusOffer["productType"];
  month: number;
  /** YYYY-MM */
  monthLabel: string;
  applyDate: IsoDate;
  hardPull: boolean;
  loads: RequirementLoad[];
  /** Assumed to post when the last requirement window ends. */
  bonusDate: IsoDate;
  bonusMonth: number;
  value: OfferValue;
  /** Running total of net value in application order. */
  cumulativeNetCents: number;
  locked: boolean;
  reasons: string[];
}

export interface MonthUsage {
  month: number;
  label: string;
  /** False for months after the horizon that only carry requirement tails or bonus postings. */
  inHorizon: boolean;
  spendCents: number;
  ddCents: number;
  ddSplits: number;
  parkedCents: number;
  applications: string[];
  /** Hard pulls (history and plan) in the 6 and 12 months ending this month. */
  pullsLast6: number;
  pullsLast12: number;
  /** Net value of bonuses posting this month, and the running total by posting month. */
  postedNetCents: number;
  cumulativeNetCents: number;
}

export type SkipKind =
  | "excluded"
  | "expired"
  | "not_worth_it"
  | "ineligible"
  | "capacity"
  | "outvalued"
  | "pull_limit"
  | "conflict"
  | "locked_infeasible";

export interface SkippedOffer {
  offerId: string;
  title: string;
  netCents: number;
  kind: SkipKind;
  reason: string;
  eligibleFrom: IsoDate | null;
}

export interface Plan {
  startDate: IsoDate;
  horizonMonths: number;
  steps: PlanStep[];
  months: MonthUsage[];
  skipped: SkippedOffer[];
  totalNetCents: number;
  capacity: {
    spendCents: number;
    ddCents: number;
    ddSplits: number;
    parkedCents: number;
    pullsPer6: number;
    pullsPer12: number;
  };
  assumptions: string[];
}

type BlockKind = "expired" | "ineligible" | "pull_limit" | "capacity" | "conflict";
interface Block {
  ok: false;
  kind: BlockKind;
  message: string;
  eligibleFrom?: IsoDate | null;
  /** Plan steps holding the capacity this offer needed. */
  conflictIds?: string[];
  /** The requirement alone exceeds capacity. */
  alone?: boolean;
}
interface Placed {
  ok: true;
  offer: BonusOffer;
  month: number;
  date: IsoDate;
  record: AccountRecord;
  loads: RequirementLoad[];
}
interface State {
  placed: Placed[];
  value: number;
  monthSum: number;
  sig: string;
}

const BRANCH = 2;
const LOAD_LABEL: Record<LoadKind, string> = {
  spend: "monthly spend",
  dd: "direct deposit",
  parked: "parked cash",
};

export const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;

const monthIndex = (date: IsoDate) => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return y * 12 + m;
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-03" -> "Mar 2027". */
export const monthName = (label: string) => {
  const [y, m] = label.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

/**
 * Builds a month-by-month plan with a deterministic beam search: offers are decided in order
 * (locked first, then by net value), each branch either skips an offer or places it in one of its
 * earliest feasible months; every placement re-validates eligibility, pulls and capacity for the
 * whole plan. Rules come from data (checkEligibility); nothing issuer-specific is coded here.
 */
export function buildPlan(input: PlannerInput): Plan {
  const H = Math.max(1, Math.floor(input.horizonMonths));
  const start = input.startDate;
  const firstOfStart = `${start.slice(0, 8)}01`;
  const monthDate = (m: number): IsoDate => (m === 0 ? start : addMonths(firstOfStart, m));
  const monthOf = (date: IsoDate) => monthIndex(date) - monthIndex(start);
  const label = (m: number) => addMonths(firstOfStart, m).slice(0, 7);

  const cap = {
    spendCents: Math.max(0, input.monthlySpendCents),
    ddCents: Math.max(0, input.directDepositMonthlyCents),
    ddSplits: Math.max(0, Math.floor(input.directDepositSplits)),
    parkedCents: Math.max(0, input.parkedCashCents ?? 0),
    pullsPer6: Math.max(0, Math.floor(input.maxPullsPer6Months)),
    pullsPer12: Math.max(0, Math.floor(input.maxPullsPer12Months)),
  };
  const capFor: Record<LoadKind, number> = {
    spend: cap.spendCents,
    dd: cap.ddCents,
    parked: cap.parkedCents,
  };

  const cardById = new Map(input.cards.map((c) => [c.id, c]));
  const cardOf = (o: BonusOffer) => (o.cardId ? (cardById.get(o.cardId) ?? null) : null);
  const cpp = (currencyId: string) =>
    input.centsPerPointOverrides?.[currencyId] ??
    input.currencies.find((c) => c.id === currencyId)?.defaultCentsPerPoint ??
    (currencyId === "usd" ? 1 : 0);
  const values = new Map(
    input.offers.map((o) => [
      o.id,
      plannerOfferValue(o, { card: cardOf(o), centsPerPoint: cpp(o.bonusCurrencyId) }),
    ]),
  );
  const valueOf = (o: BonusOffer) => values.get(o.id) as OfferValue;
  const historyPulls = input.history.filter((a) => a.productType === "credit_card").map((a) => a.openedAt);

  const loadsFor = (o: BonusOffer, m: number): RequirementLoad[] => {
    const r = o.requirements;
    const span = (days: number | null) => Math.max(1, Math.round((days ?? DAYS_PER_MONTH) / DAYS_PER_MONTH));
    const mk = (kind: LoadKind, total: number, months: number): RequirementLoad => ({
      kind,
      fromMonth: m,
      months,
      totalCents: total,
      monthlyCents: kind === "parked" ? total : Math.round(total / months),
    });
    const loads: RequirementLoad[] = [];
    if (r.minSpendCents) loads.push(mk("spend", r.minSpendCents, span(r.spendWindowDays)));
    if (r.directDepositTotalCents)
      loads.push(mk("dd", r.directDepositTotalCents, span(r.directDepositWindowDays)));
    const parked = Math.max(r.minDepositCents ?? 0, r.minBalanceCents ?? 0);
    if (parked > 0) loads.push(mk("parked", parked, span(r.holdingPeriodDays)));
    return loads;
  };
  // Parked cash is a balance held every month; spend and deposits are spread over the window.
  const exact = (l: RequirementLoad) => (l.kind === "parked" ? l.totalCents : l.totalCents / l.months);
  const covers = (l: RequirementLoad, k: number) => k >= l.fromMonth && k < l.fromMonth + l.months;

  const baseHistory = input.history;
  const historyWith = (placed: readonly Placed[], extra?: AccountRecord, omit?: string) => [
    ...baseHistory,
    ...placed.filter((p) => p.offer.id !== omit).map((p) => p.record),
    ...(extra ? [extra] : []),
  ];
  const eligibility = (o: BonusOffer, history: AccountRecord[], asOf: IsoDate) =>
    checkEligibility(o, { rules: input.rules, history, asOf, cards: input.cards });
  // The issue that binds longest: never-clearing first, then the latest date.
  const binding = (issues: EligibilityIssue[]) =>
    [...issues].sort((a, b) =>
      (b.eligibleFrom ?? "9999").localeCompare(a.eligibleFrom ?? "9999"),
    )[0] as EligibilityIssue;

  function tryPlace(placed: readonly Placed[], o: BonusOffer, m: number): Placed | Block {
    let date = monthDate(m);
    if (o.expiresAt && date > o.expiresAt) {
      return { ok: false, kind: "expired", message: `The offer expires ${o.expiresAt}.` };
    }
    const history = historyWith(placed, undefined, o.id);
    let elig = eligibility(o, history, date);
    if (
      !elig.eligible &&
      elig.eligibleFrom &&
      elig.eligibleFrom < monthDate(m + 1) &&
      !(o.expiresAt && elig.eligibleFrom > o.expiresAt)
    ) {
      date = elig.eligibleFrom;
      elig = eligibility(o, history, date);
    }
    if (!elig.eligible) {
      const issue = binding(elig.issues);
      return { ok: false, kind: "ineligible", message: issue.reason, eligibleFrom: elig.eligibleFrom };
    }

    const card = cardOf(o);
    const value = valueOf(o);
    const bonusDate = addDays(date, requirementDays(o) || 30);
    const record: AccountRecord = {
      id: `plan:${o.id}`,
      institutionId: o.institutionId,
      productType: o.productType,
      productId: o.cardId ?? o.depositProductId,
      productFamily: card?.productFamily ?? null,
      name: o.title,
      openedAt: date,
      closedAt: o.productType === "credit_card" ? null : addDays(date, value.holdDays),
      isBusiness: card?.isBusiness ?? false,
      bonusReceivedAt: bonusDate,
    };

    if (o.productType === "credit_card") {
      const planned = [
        ...placed.filter((p) => p.offer.productType === "credit_card").map((p) => p.date),
        date,
      ];
      const all = [...historyPulls, ...planned];
      for (const [months, limit] of [
        [6, cap.pullsPer6],
        [12, cap.pullsPer12],
      ] as const) {
        for (const end of planned) {
          const from = addMonths(end, -months);
          const n = all.filter((d) => d > from && d <= end).length;
          if (n > limit) {
            return {
              ok: false,
              kind: "pull_limit",
              message: `Would be ${n} hard pulls in the ${months} months ending ${end}; your limit is ${limit}.`,
            };
          }
        }
      }
    }

    const loads = loadsFor(o, m);
    for (const l of loads) {
      if (l.kind === "dd" && cap.ddSplits === 0) {
        return {
          ok: false,
          kind: "capacity",
          alone: true,
          message: "Needs a direct deposit and you have no splits available.",
        };
      }
      if (exact(l) > capFor[l.kind] + 0.5) {
        return {
          ok: false,
          kind: "capacity",
          alone: true,
          message: `Needs ${usd(exact(l))}${l.kind === "parked" ? "" : "/month"} of ${LOAD_LABEL[l.kind]} for ${l.months} month${l.months > 1 ? "s" : ""}; you have ${usd(capFor[l.kind])}.`,
        };
      }
      for (let k = l.fromMonth; k < l.fromMonth + l.months; k++) {
        const others = placed.filter((p) => p.loads.some((x) => x.kind === l.kind && covers(x, k)));
        const used = others.reduce(
          (s, p) =>
            s + p.loads.filter((x) => x.kind === l.kind && covers(x, k)).reduce((a, x) => a + exact(x), 0),
          0,
        );
        const names = others.map((p) => p.offer.title).join(", ");
        if (used + exact(l) > capFor[l.kind] + 0.5) {
          return {
            ok: false,
            kind: "capacity",
            conflictIds: others.map((p) => p.offer.id),
            message: `In ${monthName(label(k))}, ${names} already use ${usd(used)} of your ${usd(capFor[l.kind])} ${LOAD_LABEL[l.kind]}; this needs ${usd(exact(l))} more.`,
          };
        }
        if (l.kind === "dd" && others.length + 1 > cap.ddSplits) {
          return {
            ok: false,
            kind: "capacity",
            conflictIds: others.map((p) => p.offer.id),
            message: `In ${monthName(label(k))}, your direct deposit is already split across ${others.length} account${others.length > 1 ? "s" : ""} (${names}); your limit is ${cap.ddSplits}.`,
          };
        }
      }
    }

    // Opening this account must not make a later planned application ineligible (e.g. 5/24).
    for (const p of placed) {
      if (p.date < date) continue;
      const e = eligibility(p.offer, historyWith(placed, record, p.offer.id), p.date);
      if (!e.eligible) {
        return {
          ok: false,
          kind: "conflict",
          conflictIds: [p.offer.id],
          message: `Would make ${p.offer.title} (planned ${p.date}) ineligible: ${binding(e.issues).reason}`,
        };
      }
    }
    return { ok: true, offer: o, month: m, date, record, loads };
  }

  const sigOf = (placed: readonly Placed[]) =>
    placed
      .map((p) => `${p.offer.id}@${String(p.month).padStart(2, "0")}`)
      .sort()
      .join("|");
  const add = (s: State, p: Placed): State => {
    const placed = [...s.placed, p];
    return {
      placed,
      value: s.value + valueOf(p.offer).netCents,
      monthSum: s.monthSum + p.month,
      sig: sigOf(placed),
    };
  };
  // More value first, then bonuses sooner, then a stable id-based signature.
  const better = (a: State, b: State) =>
    b.value - a.value || a.monthSum - b.monthSum || (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0);

  // Decide what is out before searching.
  const excluded = new Set(input.excluded ?? []);
  const locks = new Map<string, PlannerLock>();
  for (const l of input.locked ?? []) if (!excluded.has(l.offerId)) locks.set(l.offerId, l);
  const skipped: SkippedOffer[] = [];
  const skip = (o: BonusOffer, kind: SkipKind, reason: string, eligibleFrom: IsoDate | null = null) =>
    skipped.push({
      offerId: o.id,
      title: o.title,
      netCents: valueOf(o).netCents,
      kind,
      reason,
      eligibleFrom,
    });

  const candidates: BonusOffer[] = [];
  for (const o of input.offers) {
    if (excluded.has(o.id)) skip(o, "excluded", "You excluded this offer.");
    else if (o.expiresAt && o.expiresAt < start) skip(o, "expired", `Expired on ${o.expiresAt}.`);
    else if (!locks.has(o.id) && valueOf(o).netCents <= 0)
      skip(
        o,
        "not_worth_it",
        `Net value is ${usd(valueOf(o).netCents)} after fees, so it is not worth a slot.`,
      );
    else candidates.push(o);
  }
  const byId = (a: BonusOffer, b: BonusOffer) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const order = [
    ...candidates.filter((o) => locks.has(o.id)).sort(byId),
    ...candidates
      .filter((o) => !locks.has(o.id))
      .sort((a, b) => valueOf(b).netCents - valueOf(a).netCents || byId(a, b)),
  ];

  const width = Math.max(1, input.beamWidth ?? 8);
  const allMonths = Array.from({ length: H }, (_, m) => m);
  const lockedInfeasible = new Set<string>();
  let beam: State[] = [{ placed: [], value: 0, monthSum: 0, sig: "" }];
  for (const o of order) {
    const lock = locks.get(o.id);
    const months = lock?.month != null ? (lock.month >= 0 && lock.month < H ? [lock.month] : []) : allMonths;
    const next: State[] = [];
    for (const s of beam) {
      if (!lock) next.push(s);
      let found = 0;
      for (const m of months) {
        const r = tryPlace(s.placed, o, m);
        if (r.ok) {
          next.push(add(s, r));
          if (++found >= BRANCH) break;
        }
      }
    }
    if (next.length === 0) {
      lockedInfeasible.add(o.id);
      continue;
    }
    const seen = new Set<string>();
    beam = next
      .sort(better)
      .filter((s) => !seen.has(s.sig) && seen.add(s.sig))
      .slice(0, width);
  }

  // Fill pass: anything a branch skipped that still fits goes in at its earliest month.
  const filled = beam.map((s) => {
    let cur = s;
    for (const o of order) {
      if (lockedInfeasible.has(o.id) || cur.placed.some((p) => p.offer.id === o.id)) continue;
      for (const m of allMonths) {
        const r = tryPlace(cur.placed, o, m);
        if (r.ok) {
          cur = add(cur, r);
          break;
        }
      }
    }
    return cur;
  });
  const best = filled.sort(better)[0] as State;
  const placed = [...best.placed].sort((a, b) => a.date.localeCompare(b.date) || byId(a.offer, b.offer));
  const titleOf = (id: string) => input.offers.find((o) => o.id === id)?.title ?? id;

  // Why not, for every candidate left out.
  for (const o of order) {
    if (placed.some((p) => p.offer.id === o.id)) continue;
    const lockMonth = locks.get(o.id)?.month;
    const months = lockMonth != null ? [lockMonth].filter((m) => m >= 0 && m < H) : allMonths;
    const blocks = months.map((m) => tryPlace(placed, o, m)).filter((r): r is Block => !r.ok);
    const prefix = locks.has(o.id) ? "Locked, but it cannot fit: " : "";
    const kind = (k: SkipKind): SkipKind => (locks.has(o.id) ? "locked_infeasible" : k);
    if (blocks.length === 0) {
      skip(
        o,
        kind("expired"),
        `${prefix}No month in the plan to place it${lockMonth != null ? ` (locked to month ${lockMonth + 1})` : ""}.`,
      );
      continue;
    }
    const live = blocks.filter((b) => b.kind !== "expired");
    if (live.length === 0) {
      skip(o, kind("expired"), `${prefix}The offer expires ${o.expiresAt} before it can fit in the plan.`);
      continue;
    }
    if (live.every((b) => b.kind === "ineligible")) {
      const last = live[live.length - 1] as Block;
      const from = last.eligibleFrom ?? null;
      const when = from
        ? o.expiresAt && from > o.expiresAt
          ? ` You become eligible on ${from}, after the offer expires.`
          : ` You become eligible on ${from}, after this plan ends.`
        : " This does not clear on its own.";
      skip(o, kind("ineligible"), `${prefix}${(live[0] as Block).message}${when}`, from);
      continue;
    }
    const usable = live.filter((b) => b.kind !== "ineligible");
    const counts = new Map<BlockKind, number>();
    for (const b of usable) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    const first = usable.find((b) => b.kind === top) as Block;
    const conflicts = [...new Set(usable.flatMap((b) => b.conflictIds ?? []))];
    if (first.kind === "capacity" && !first.alone && conflicts.length > 0) {
      const list = conflicts.map(
        (id) =>
          `${titleOf(id)} (${usd(valueOf(input.offers.find((x) => x.id === id) as BonusOffer).netCents)})`,
      );
      skip(
        o,
        kind("outvalued"),
        `${prefix}Lower value than the steps that use the same capacity in every month it could fit: ${list.join(", ")}. For example: ${first.message}`,
      );
    } else {
      skip(
        o,
        kind(
          first.kind === "capacity" ? "capacity" : first.kind === "pull_limit" ? "pull_limit" : "conflict",
        ),
        `${prefix}${first.message}`,
      );
    }
  }
  for (const id of lockedInfeasible) {
    if (!skipped.some((s) => s.offerId === id)) {
      const o = input.offers.find((x) => x.id === id) as BonusOffer;
      skip(o, "locked_infeasible", "Locked, but no month in the plan satisfies its rules and your capacity.");
    }
  }

  // Explanations for chosen steps.
  const rulesFor = (o: BonusOffer) =>
    input.rules.filter(
      (r) =>
        r.appliesTo.institutionIds.includes(o.institutionId) &&
        r.appliesTo.productTypes.includes(o.productType),
    );
  let running = 0;
  const steps: PlanStep[] = placed.map((p) => {
    const o = p.offer;
    const v = valueOf(o);
    const reasons: string[] = [];
    if (locks.has(o.id)) reasons.push("You locked this offer into the plan.");

    const others = placed.filter((x) => x !== p);
    if (p.month === 0 && p.date === monthDate(0)) {
      reasons.push("Open right away: you look eligible now and it fits your capacity.");
    } else {
      const prev = p.month > 0 ? tryPlace(others, o, p.month - 1) : null;
      const prevMonth = p.month > 0 ? monthName(label(p.month - 1)) : "";
      if (p.date !== monthDate(p.month)) {
        reasons.push(`Apply on or after ${p.date}, the first day the rules allow.`);
      }
      if (prev && !prev.ok) {
        if (prev.kind === "ineligible") {
          reasons.push(
            `Not before ${monthName(label(p.month))}: in ${prevMonth}, ${prev.message}${prev.eligibleFrom ? ` You become eligible on ${prev.eligibleFrom}.` : ""}`,
          );
        } else if (prev.kind === "capacity" && prev.conflictIds?.length) {
          reasons.push(
            `Scheduled after ${prev.conflictIds.map(titleOf).join(", ")} so the requirements don't overlap beyond your capacity. ${prev.message}`,
          );
        } else {
          reasons.push(
            `Not earlier: in ${prevMonth}, ${prev.message.charAt(0).toLowerCase()}${prev.message.slice(1)}`,
          );
        }
      } else if (prev && prev.ok) {
        reasons.push(
          `Placed in ${monthName(label(p.month))} rather than earlier so a higher-value combination fits.`,
        );
      }
    }
    for (const l of p.loads) {
      if (l.kind === "parked") continue;
      let peak = { k: -1, used: 0, names: [] as string[] };
      for (let k = l.fromMonth; k < l.fromMonth + l.months; k++) {
        const overlap = others.filter((x) => x.loads.some((y) => y.kind === l.kind && covers(y, k)));
        const used = overlap.reduce(
          (s, x) =>
            s + x.loads.filter((y) => y.kind === l.kind && covers(y, k)).reduce((a, y) => a + exact(y), 0),
          0,
        );
        if (overlap.length && used > peak.used) peak = { k, used, names: overlap.map((x) => x.offer.title) };
      }
      if (peak.k >= 0) {
        reasons.push(
          `Its ${l.kind === "spend" ? "minimum spend" : "direct deposit"} overlaps ${peak.names.join(", ")}; in ${monthName(label(peak.k))} together they need ${usd(peak.used + exact(l))} of your ${usd(capFor[l.kind])} ${LOAD_LABEL[l.kind]}.`,
        );
      }
    }
    const rules = rulesFor(o);
    if (rules.length)
      reasons.push(
        `Rules checked (sample data, verify before applying): ${rules.map((r) => r.name).join("; ")}.`,
      );
    running += v.netCents;
    return {
      offerId: o.id,
      title: o.title,
      institutionId: o.institutionId,
      productType: o.productType,
      month: p.month,
      monthLabel: label(p.month),
      applyDate: p.date,
      hardPull: o.productType === "credit_card",
      loads: p.loads,
      bonusDate: p.record.bonusReceivedAt as IsoDate,
      bonusMonth: monthOf(p.record.bonusReceivedAt as IsoDate),
      value: v,
      cumulativeNetCents: running,
      locked: locks.has(o.id),
      reasons,
    };
  });

  // Per-month usage, through the last requirement month or bonus posting.
  const lastMonth = Math.max(
    H - 1,
    ...steps.map((s) => s.bonusMonth),
    ...steps.flatMap((s) => s.loads.map((l) => l.fromMonth + l.months - 1)),
  );
  const pullDates = [
    ...historyPulls,
    ...placed.filter((p) => p.offer.productType === "credit_card").map((p) => p.date),
  ];
  let cumulative = 0;
  const months: MonthUsage[] = Array.from({ length: lastMonth + 1 }, (_, k) => {
    const sum = (kind: LoadKind) =>
      Math.round(
        placed.reduce(
          (s, p) =>
            s + p.loads.filter((l) => l.kind === kind && covers(l, k)).reduce((a, l) => a + exact(l), 0),
          0,
        ),
      );
    const end = addMonths(firstOfStart, k + 1);
    const pulls = (n: number) => pullDates.filter((d) => d < end && d >= addMonths(end, -n)).length;
    const posted = steps.filter((s) => s.bonusMonth === k).reduce((a, s) => a + s.value.netCents, 0);
    cumulative += posted;
    return {
      month: k,
      label: label(k),
      inHorizon: k < H,
      spendCents: sum("spend"),
      ddCents: sum("dd"),
      ddSplits: placed.filter((p) => p.loads.some((l) => l.kind === "dd" && covers(l, k))).length,
      parkedCents: sum("parked"),
      applications: steps.filter((s) => s.month === k).map((s) => s.offerId),
      pullsLast6: pulls(6),
      pullsLast12: pulls(12),
      postedNetCents: posted,
      cumulativeNetCents: cumulative,
    };
  });

  const rank = (s: SkippedOffer) => (s.kind === "excluded" ? 1 : 0);
  skipped.sort((a, b) => b.netCents - a.netCents || rank(a) - rank(b) || (a.offerId < b.offerId ? -1 : 1));

  return {
    startDate: start,
    horizonMonths: H,
    steps,
    months,
    skipped,
    totalNetCents: running,
    capacity: cap,
    assumptions: [
      "Eligibility rules and offers are sample data. Verify every rule and offer term with the issuer before applying.",
      "Card minimum spends come from organic spending you would do anyway, spread evenly over the spend window (rounded to whole months).",
      "Direct deposits are spread evenly over the deposit window; each active requirement uses one split.",
      "Credit card applications are hard pulls; bank accounts are treated as soft pulls (some banks do pull hard).",
      "Bonuses are assumed to post when the last requirement window ends; real posting can take several weeks more.",
      "Net value is the bonus at your cents-per-point value minus the first-year annual fee (unless waived), unwaived monthly fees, and an early-closure fee only when that is cheaper than keeping the account open.",
      "Deposit accounts are assumed closed after their holding period; cards stay open. Ongoing card rewards and interest on parked cash are not counted.",
      "Applications in later months are dated the 1st, or the first day the rules allow that month.",
    ],
  };
}
