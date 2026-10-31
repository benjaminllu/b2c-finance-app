"use client";

import { monthName, type Plan, type PlannerLock, type PlanStep, type SkipKind } from "@optima/core/planner";
import type { BonusOffer } from "@optima/core";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SampleBadge,
  StalenessBadge,
} from "@optima/ui";
import { formatCentsWhole } from "@/lib/format";
import type { PlannerActions } from "./planner-explorer";

const LOAD_TEXT = { spend: "Minimum spend", dd: "Direct deposit", parked: "Keep a balance of" } as const;

/** Verification status for an offer: stale offers must never be recommended silently. */
function Provenance({ offer, now }: { offer: BonusOffer | undefined; now: Date }) {
  if (!offer) return null;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      <StalenessBadge lastVerifiedAt={offer.lastVerifiedAt} kind="offers" now={now} />
      <SampleBadge isSample={offer.isSample} />
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        Source<span className="sr-only"> for {offer.title}</span>
      </a>
    </span>
  );
}

function Requirements({ step }: { step: PlanStep }) {
  if (step.loads.length === 0) return <li>No spend, deposit or balance requirement listed.</li>;
  return (
    <>
      {step.loads.map((l) => {
        const from = monthName(addMonthLabel(step.monthLabel, 0));
        const to = monthName(addMonthLabel(step.monthLabel, l.months - 1));
        const span = l.months > 1 ? `${from} to ${to}` : from;
        return (
          <li key={l.kind}>
            {l.kind === "parked"
              ? `${LOAD_TEXT.parked} ${formatCentsWhole(l.totalCents)}, ${span}`
              : l.totalCents === 0
                ? `${LOAD_TEXT[l.kind]} (no minimum amount listed), ${span}`
                : `${LOAD_TEXT[l.kind]} ${formatCentsWhole(l.totalCents)}: about ${formatCentsWhole(l.monthlyCents)}/month, ${span}`}
          </li>
        );
      })}
    </>
  );
}

/** "2026-11" + 2 -> "2027-01" */
function addMonthLabel(label: string, n: number) {
  const [y, m] = label.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

function ValueBreakdown({ step }: { step: PlanStep }) {
  const v = step.value;
  const lines: [string, number][] = [
    [
      v.centsPerPoint === 1 && v.bonusUnits === v.bonusCents
        ? "Bonus"
        : `Bonus: ${v.bonusUnits.toLocaleString("en-US")} × ${v.centsPerPoint}¢ each`,
      v.bonusCents,
    ],
  ];
  if (v.annualFeeCents) lines.push(["First-year annual fee", -v.annualFeeCents]);
  if (v.monthlyFeesCents) lines.push(["Monthly fees", -v.monthlyFeesCents]);
  if (v.earlyClosureFeeCents) lines.push(["Early-closure fee", -v.earlyClosureFeeCents]);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-sm tabular-nums">
      {lines.map(([k, c]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className="text-right">{formatCentsWhole(c)}</dd>
        </div>
      ))}
      <div className="contents font-semibold">
        <dt>Expected net value</dt>
        <dd className="text-right">{formatCentsWhole(v.netCents)}</dd>
      </div>
    </dl>
  );
}

export function PlanTimeline({
  plan,
  locks,
  actions,
  offersById,
  now,
}: {
  plan: Plan;
  locks: PlannerLock[];
  actions: PlannerActions;
  offersById: Map<string, BonusOffer>;
  now: Date;
}) {
  const byMonth = new Map<number, PlanStep[]>();
  for (const s of plan.steps) byMonth.set(s.month, [...(byMonth.get(s.month) ?? []), s]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month-by-month plan</CardTitle>
        <CardDescription>
          {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"}, {formatCentsWhole(plan.totalNetCents)}{" "}
          expected net value. Lock a step to keep it in that month, or exclude it to see the next best plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plan.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing fits these inputs. See why below, or raise your spend, direct deposit, or pull limits.
          </p>
        ) : (
          <ol className="space-y-6">
            {[...byMonth.entries()].map(([month, steps]) => (
              <li key={month}>
                <h4 className="mb-2 font-semibold">
                  {monthName(steps[0]?.monthLabel ?? "")}{" "}
                  <span className="font-normal text-muted-foreground">(month {month + 1})</span>
                </h4>
                <ul className="space-y-3">
                  {steps.map((step) => {
                    const lock = locks.find((l) => l.offerId === step.offerId);
                    return (
                      <li key={step.offerId} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{step.title}</p>
                            <p className="text-sm text-muted-foreground">
                              Apply {step.applyDate} · bonus expected about {step.bonusDate}
                              {step.bonusPostingDays === null && " (posting time unknown, may be later)"}
                            </p>
                            <Provenance offer={offersById.get(step.offerId)} now={now} />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={step.hardPull ? "warning" : "secondary"}>
                              {step.hardPull ? "Hard pull" : "Soft pull"}
                            </Badge>
                            {step.locked && <Badge variant="outline">Locked</Badge>}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-sm font-medium">Requirements</p>
                            <ul className="list-disc pl-5 text-sm">
                              <Requirements step={step} />
                            </ul>
                          </div>
                          <div>
                            <ValueBreakdown step={step} />
                            <p className="mt-1 text-sm text-muted-foreground">
                              Running total: {formatCentsWhole(step.cumulativeNetCents)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-medium">Why this step, and why now</p>
                          <ul className="list-disc pl-5 text-sm">
                            {step.reasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lock ? (
                            <Button size="sm" variant="outline" onClick={() => actions.unlock(step.offerId)}>
                              Unlock {step.title}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actions.lock(step.offerId, step.month)}
                            >
                              Lock in {monthName(step.monthLabel)}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => actions.exclude(step.offerId)}
                            aria-label={`Exclude ${step.title} from the plan`}
                          >
                            Exclude
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const SKIP_LABEL: Record<SkipKind, string> = {
  excluded: "Excluded by you",
  expired: "Expired",
  not_worth_it: "Not worth it",
  ineligible: "Likely ineligible",
  capacity: "Exceeds capacity",
  outvalued: "Lower value",
  pull_limit: "Pull limit",
  conflict: "Rule conflict",
  locked_infeasible: "Locked, cannot fit",
};

export function SkippedList({
  plan,
  locks,
  excluded,
  actions,
  offersById,
  now,
}: {
  plan: Plan;
  locks: PlannerLock[];
  excluded: string[];
  actions: PlannerActions;
  offersById: Map<string, BonusOffer>;
  now: Date;
}) {
  if (plan.skipped.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Why not these offers?</CardTitle>
        <CardDescription>
          Every offer left out of the plan, highest value first, with the reason.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {plan.skipped.map((s) => {
            const isExcluded = excluded.includes(s.offerId);
            const isLocked = locks.some((l) => l.offerId === s.offerId);
            return (
              <li key={s.offerId} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">
                    {s.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({formatCentsWhole(s.netCents)} net)
                    </span>
                  </p>
                  <Badge
                    variant={
                      s.kind === "ineligible" || s.kind === "locked_infeasible" ? "destructive" : "outline"
                    }
                  >
                    {SKIP_LABEL[s.kind]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{s.reason}</p>
                <Provenance offer={offersById.get(s.offerId)} now={now} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {isExcluded ? (
                    <Button size="sm" variant="outline" onClick={() => actions.include(s.offerId)}>
                      Include {s.title} again
                    </Button>
                  ) : isLocked ? (
                    <Button size="sm" variant="outline" onClick={() => actions.unlock(s.offerId)}>
                      Unlock {s.title}
                    </Button>
                  ) : (
                    s.kind !== "expired" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actions.lock(s.offerId, null)}
                          aria-label={`Must include ${s.title}`}
                        >
                          Must include
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => actions.exclude(s.offerId)}
                          aria-label={`Exclude ${s.title}`}
                        >
                          Exclude
                        </Button>
                      </>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
