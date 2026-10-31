"use client";

import { useId, useMemo } from "react";
import {
  US_STATES,
  type BonusOffer,
  type CreditCard,
  type EligibilityRule,
  type RewardCurrency,
} from "@optima/core";
import { buildPlan, type PlannerLock } from "@optima/core/planner";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from "@optima/ui";
import {
  AccountHistoryEditor,
  type InstitutionOption,
  type ProductOption,
} from "@/components/accounts/account-history-editor";
import { clampInt, dollarsToCents, useUrlState } from "@/components/banking/use-url-state";
import { useAccountHistory } from "@/lib/account-history";
import { PlanCapacity } from "./plan-capacity";
import { PlanTimeline, SkippedList } from "./plan-timeline";

const DEFAULTS = {
  spend: "2500",
  dd: "3000",
  splits: "2",
  cash: "0",
  p6: "2",
  p12: "4",
  h: "12",
  start: "",
  lock: "",
  ex: "",
  cpp: "",
  st: "",
};

/** "a:3,b" -> [{a, month 3}, {b, any month}] */
const parseLocks = (s: string): PlannerLock[] =>
  s
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [offerId = "", month] = part.split(":");
      const m = month === undefined ? null : Number.parseInt(month, 10);
      return { offerId, month: m !== null && Number.isFinite(m) ? m : null };
    });
const formatLocks = (locks: PlannerLock[]) =>
  locks.map((l) => (l.month == null ? l.offerId : `${l.offerId}:${l.month}`)).join(",");

/** "chase-ur:1.5,amex-mr:1.1" -> { "chase-ur": 1.5, ... } (positive numbers only). */
const parseCpp = (s: string) =>
  Object.fromEntries(
    s
      .split(",")
      .map((p) => p.split(":"))
      .map(([k, v]) => [k ?? "", Number.parseFloat(v ?? "")] as const)
      .filter(([k, v]) => k && Number.isFinite(v) && v > 0),
  );

export function PlannerExplorer({
  offers,
  rules,
  cards,
  currencies,
  institutions,
  products,
  nowIso,
}: {
  offers: BonusOffer[];
  rules: EligibilityRule[];
  cards: CreditCard[];
  currencies: RewardCurrency[];
  institutions: InstitutionOption[];
  products: ProductOption[];
  nowIso: string;
}) {
  const ids = useId();
  const [s, update] = useUrlState(DEFAULTS);
  const [history] = useAccountHistory();
  const today = nowIso.slice(0, 10);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const offersById = useMemo(() => new Map(offers.map((o) => [o.id, o])), [offers]);
  const thisMonth = today.slice(0, 7);
  const startMonth = /^\d{4}-\d{2}$/.test(s.start) && s.start > thisMonth ? s.start : thisMonth;
  const startDate = startMonth === thisMonth ? today : `${startMonth}-01`;
  const horizon = s.h === "24" ? 24 : 12;
  const locks = useMemo(() => parseLocks(s.lock), [s.lock]);
  const excluded = useMemo(() => s.ex.split(",").filter(Boolean), [s.ex]);
  const cpp = useMemo(() => parseCpp(s.cpp), [s.cpp]);

  const plan = useMemo(
    () =>
      buildPlan({
        history,
        monthlySpendCents: dollarsToCents(s.spend),
        directDepositMonthlyCents: dollarsToCents(s.dd),
        directDepositSplits: clampInt(s.splits, 0, 10, 2),
        parkedCashCents: dollarsToCents(s.cash),
        maxPullsPer6Months: clampInt(s.p6, 0, 20, 2),
        maxPullsPer12Months: clampInt(s.p12, 0, 30, 4),
        horizonMonths: horizon,
        startDate,
        state: US_STATES.includes(s.st) ? s.st : null,
        offers,
        rules,
        cards,
        currencies,
        centsPerPointOverrides: cpp,
        locked: locks,
        excluded,
      }),
    [
      history,
      s.spend,
      s.dd,
      s.splits,
      s.cash,
      s.p6,
      s.p12,
      horizon,
      startDate,
      s.st,
      offers,
      rules,
      cards,
      currencies,
      cpp,
      locks,
      excluded,
    ],
  );

  const actions = {
    lock: (offerId: string, month: number | null) =>
      update({
        lock: formatLocks([...locks.filter((l) => l.offerId !== offerId), { offerId, month }]),
        ex: excluded.filter((e) => e !== offerId).join(","),
      }),
    unlock: (offerId: string) => update({ lock: formatLocks(locks.filter((l) => l.offerId !== offerId)) }),
    exclude: (offerId: string) =>
      update({
        ex: [...excluded.filter((e) => e !== offerId), offerId].join(","),
        lock: formatLocks(locks.filter((l) => l.offerId !== offerId)),
      }),
    include: (offerId: string) => update({ ex: excluded.filter((e) => e !== offerId).join(",") }),
  };

  // Only currencies some offer pays in, for the point-value inputs.
  const usedCurrencies = currencies.filter(
    (c) => c.kind !== "cash" && offers.some((o) => o.bonusCurrencyId === c.id),
  );
  const setCpp = (id: string, value: string) => {
    const next = { ...cpp } as Record<string, number>;
    const n = Number.parseFloat(value);
    if (Number.isFinite(n) && n > 0) next[id] = n;
    else delete next[id];
    update({
      cpp: Object.entries(next)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
    });
  };

  const numberField = (
    key: keyof typeof DEFAULTS,
    label: string,
    hint: string,
    opts: { prefix?: boolean } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${ids}-${key}`}>{label}</Label>
      <div className="flex items-center gap-1">
        {opts.prefix && <span aria-hidden>$</span>}
        <Input
          id={`${ids}-${key}`}
          inputMode={opts.prefix ? "decimal" : "numeric"}
          value={s[key]}
          onChange={(e) => update({ [key]: e.target.value })}
          aria-describedby={`${ids}-${key}-hint`}
        />
      </div>
      <p id={`${ids}-${key}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <strong>Verify before you apply.</strong> Issuer rules and offers here may be out of date or wrong,
        and this is not financial advice. Verify every rule and offer term with the issuer before you apply.
        Opening accounts affects your credit.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Your capacity</CardTitle>
          <CardDescription>
            The plan never asks for more spend, direct deposit, cash or hard pulls than this.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numberField("spend", "Monthly spend", "Organic spending you can put on a new card each month.", {
            prefix: true,
          })}
          {numberField(
            "dd",
            "Direct deposit per month",
            "Paycheck amount you can route to new bank accounts.",
            { prefix: true },
          )}
          {numberField(
            "splits",
            "Direct deposit splits",
            "How many accounts your paycheck can go to at once.",
          )}
          {numberField("cash", "Cash to park", "Savings you can move for new-money and balance bonuses.", {
            prefix: true,
          })}
          {numberField(
            "p6",
            "Max hard pulls per 6 months",
            "Applications marked as hard pulls: most cards and some bank accounts.",
          )}
          {numberField(
            "p12",
            "Max hard pulls per 12 months",
            "Across any rolling 12 months, including recent cards.",
          )}
          <div className="space-y-1">
            <Label htmlFor={`${ids}-st`}>Your state</Label>
            <Select id={`${ids}-st`} value={s.st} onChange={(e) => update({ st: e.target.value })}>
              <option value="">Not set</option>
              {US_STATES.map((st) => (
                <option key={st}>{st}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Skips offers not open where you live.</p>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Plan length</legend>
            <div className="flex gap-4 pt-2">
              {(["12", "24"] as const).map((h) => (
                <label key={h} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${ids}-h`}
                    value={h}
                    checked={String(horizon) === h}
                    onChange={() => update({ h })}
                  />
                  {h} months
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-start`}>Start month</Label>
            <Input
              id={`${ids}-start`}
              type="month"
              min={thisMonth}
              value={startMonth}
              onChange={(e) => update({ start: e.target.value === thisMonth ? "" : e.target.value })}
            />
            <p className="text-xs text-muted-foreground">This month starts today ({today}).</p>
          </div>
          {usedCurrencies.length > 0 && (
            <details className="sm:col-span-2 lg:col-span-4">
              <summary className="cursor-pointer text-sm font-medium">Point values (cents per point)</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {usedCurrencies.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <Label htmlFor={`${ids}-cpp-${c.id}`}>{c.name}</Label>
                    <Input
                      id={`${ids}-cpp-${c.id}`}
                      inputMode="decimal"
                      placeholder={String(c.defaultCentsPerPoint)}
                      defaultValue={cpp[c.id] ?? ""}
                      onBlur={(e) => setCpp(c.id, e.target.value)}
                      aria-describedby={`${ids}-cpp-${c.id}-hint`}
                    />
                    <p id={`${ids}-cpp-${c.id}-hint`} className="text-xs text-muted-foreground">
                      Default {c.defaultCentsPerPoint}¢ ({c.valuationSource}). Applies when you leave the
                      field.
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts you have opened</CardTitle>
          <CardDescription>
            Used for issuer rules like 5/24 and bonus lookbacks. Shared with the offers page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountHistoryEditor institutions={institutions} products={products} />
        </CardContent>
      </Card>

      <PlanCapacity plan={plan} />
      <PlanTimeline plan={plan} locks={locks} actions={actions} offersById={offersById} now={now} />
      <SkippedList
        plan={plan}
        locks={locks}
        excluded={excluded}
        actions={actions}
        offersById={offersById}
        now={now}
      />

      <Card>
        <CardHeader>
          <CardTitle>Assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export type PlannerActions = {
  lock: (offerId: string, month: number | null) => void;
  unlock: (offerId: string) => void;
  exclude: (offerId: string) => void;
  include: (offerId: string) => void;
};
