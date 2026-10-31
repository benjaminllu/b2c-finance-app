"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  SampleBadge,
  Select,
  StalenessBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@optima/ui";
import {
  CATEGORY_LABELS,
  type CreditCard,
  type EarnRule,
  type Issuer,
  type RewardCurrency,
} from "@optima/core";
import { formatCentsWhole } from "@/lib/format";
import {
  filterAndSort,
  NO_FILTERS,
  PICKER_SORTS,
  type PickerFilters,
  type PickerRow,
  type PickerSort,
} from "./picker";
import type { Analysis } from "./analysis";
import { MAX_CARDS } from "./state";
import { CardArt } from "./card-art";

const unit = (cur: RewardCurrency | undefined, m: number) => (cur?.kind === "cash" ? `${m}%` : `${m}x`);

function ruleText(card: CreditCard, r: EarnRule, cur: RewardCurrency | undefined): string {
  const bits = [`${CATEGORY_LABELS[r.category]}: ${unit(cur, r.multiplier)}`];
  const group = card.capGroups.find((g) => g.id === r.capGroupId);
  if (group) {
    const shared = card.earnRules
      .filter((o) => o !== r && o.capGroupId === group.id && o.category !== r.category)
      .map((o) => CATEGORY_LABELS[o.category]);
    const period = group.capPeriod.replace("annual", "year").replace("ly", "");
    bits.push(
      `up to ${formatCentsWhole(group.capAmountCents)}/${period}` +
        (shared.length ? ` combined with ${[...new Set(shared)].join(", ")}` : ""),
    );
  }
  if (r.rotating) bits.push(`rotating (Q${r.activeQuarters?.join(", Q")})`);
  if (r.portalOnly) bits.push("issuer portal only");
  return bits.join(", ");
}

const NETWORK_LABELS: Record<CreditCard["network"], string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
};

const FEE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "0", label: "No annual fee" },
  { value: "10000", label: "Up to $100" },
  { value: "30000", label: "Up to $300" },
];

const CATCH_ALL_OPTIONS = [
  { value: "0", label: "Any" },
  { value: "1.5", label: "1.5% or more" },
  { value: "2", label: "2% or more" },
];

/** Cents per dollar as a percent, e.g. 1.25 -> "1.25%". */
const pct = (centsPerDollar: number) => `${Number(centsPerDollar.toFixed(2))}%`;

export function CardPicker({
  rows,
  issuers,
  selected,
  onToggle,
}: {
  rows: PickerRow[];
  issuers: Map<string, Issuer>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [f, setF] = useState<PickerFilters>(NO_FILTERS);
  const [sort, setSort] = useState<PickerSort>("value");
  const set = (p: Partial<PickerFilters>) => setF((prev) => ({ ...prev, ...p }));
  const issuerName = (id: string) => issuers.get(id)?.name ?? "";
  const shown = filterAndSort(rows, f, sort, issuerName);
  const issuerOptions = [...new Set(rows.map((r) => r.card.issuerId))]
    .map((id) => ({ id, name: issuerName(id) || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const networks = [...new Set(rows.map((r) => r.card.network))].sort();
  const filtered = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);

  const select = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick 2 to {MAX_CARDS} cards</CardTitle>
        <CardDescription>
          {selected.length} selected. Showing {shown.length} of {rows.length}. Rates and values use your point
          valuations and spending below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="card-search">Search cards</Label>
            <Input
              id="card-search"
              type="search"
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="e.g. Sapphire, Amex"
            />
          </div>
          {select(
            "card-sort",
            "Sort by",
            sort,
            (v) => setSort(v as PickerSort),
            Object.entries(PICKER_SORTS).map(([value, label]) => ({ value, label })),
          )}
          {select("card-issuer", "Issuer", f.issuerId, (v) => set({ issuerId: v }), [
            { value: "", label: "All" },
            ...issuerOptions.map((i) => ({ value: i.id, label: i.name })),
          ])}
          {select(
            "card-fee",
            "Annual fee",
            f.maxFeeCents === null ? "" : String(f.maxFeeCents),
            (v) => set({ maxFeeCents: v === "" ? null : Number(v) }),
            FEE_OPTIONS,
          )}
          {select(
            "card-catch-all",
            "Catch-all rate",
            String(f.minCatchAllCents),
            (v) => set({ minCatchAllCents: Number(v) }),
            CATCH_ALL_OPTIONS,
          )}
          {select("card-kind", "Rewards", f.kind, (v) => set({ kind: v }), [
            { value: "", label: "Any" },
            { value: "cash", label: "Cash back" },
            { value: "points", label: "Points" },
            { value: "miles", label: "Miles" },
          ])}
          {select("card-network", "Network", f.network, (v) => set({ network: v }), [
            { value: "", label: "Any" },
            ...networks.map((n) => ({ value: n, label: NETWORK_LABELS[n] })),
          ])}
          {select("card-audience", "Card type", f.audience, (v) => set({ audience: v }), [
            { value: "", label: "Personal and business" },
            { value: "personal", label: "Personal" },
            { value: "business", label: "Business" },
          ])}
          <div className="flex flex-col justify-end gap-2 text-sm">
            {check("Has a sign-up bonus", f.hasBonus, (v) => set({ hasBonus: v }))}
            {check("No foreign transaction fee", f.noForeignFee, (v) => set({ noForeignFee: v }))}
          </div>
          {filtered && (
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={() => setF(NO_FILTERS)}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
        <ul className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3" aria-label="Cards">
          {shown.map(({ card: c, catchAllCents, bonusCents, valueCents }) => {
            const on = selected.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={on}
                    disabled={!on && selected.length >= MAX_CARDS}
                    onChange={() => onToggle(c.id)}
                  />
                  <CardArt card={c} issuerName={issuerName(c.issuerId)} className="w-14" />
                  <span>
                    {c.name}
                    <span className="block text-xs text-muted-foreground">
                      {issuerName(c.issuerId)} ·{" "}
                      {c.annualFeeCents === 0 ? "No fee" : `${formatCentsWhole(c.annualFeeCents)} fee`} ·{" "}
                      {pct(catchAllCents)} catch-all
                      {bonusCents > 0 ? ` · ${formatCentsWhole(bonusCents)} bonus` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCentsWhole(valueCents)}/yr for your spending
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="p-2 text-sm text-muted-foreground">No cards match.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

const rate = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/**
 * One table: cards as columns (selection order, the winner highlighted wherever it sits), card details as
 * rows, then, once there is an analysis, the per-category value rows and the net total.
 */
export function CompareTable({
  cards,
  issuers,
  currencies,
  now,
  analysis,
  firstYear,
  onRemove,
}: {
  cards: CreditCard[];
  issuers: Map<string, Issuer>;
  currencies: Map<string, RewardCurrency>;
  now: Date;
  analysis: Analysis | null;
  firstYear: boolean;
  onRemove: (id: string) => void;
}) {
  const winner = analysis?.winner ?? null;
  const results = new Map(analysis?.rows.map((r) => [r.card.id, r.result]));
  const cols = [
    ...cards.map((c) => ({ id: c.id, card: c as CreditCard | null, res: results.get(c.id) })),
    ...(analysis ? [{ id: analysis.baseline.id, card: null, res: analysis.baselineResult }] : []),
  ];
  const pick = (id: string) => (winner?.cardId === id ? "bg-primary/5" : undefined);
  const spendRows = analysis?.baselineResult.categories.filter((c) => c.annualSpendCents > 0) ?? [];
  const row = (label: ReactNode, cell: (c: (typeof cols)[number]) => ReactNode, className?: string) => (
    <TableRow className={className}>
      <TableHead scope="row" className="h-auto py-2 align-top">
        {label}
      </TableHead>
      {cols.map((c) => (
        <TableCell key={c.id} className={cn("py-2 align-top", pick(c.id))}>
          {cell(c)}
        </TableCell>
      ))}
    </TableRow>
  );
  const section = (title: string) => (
    <TableRow>
      <TableHead scope="colgroup" colSpan={cols.length + 1} className="h-8 bg-muted/50 text-xs uppercase">
        {title}
      </TableHead>
    </TableRow>
  );

  return (
    <Table aria-label="Card comparison">
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">
            <span className="sr-only">Detail</span>
          </TableHead>
          {cols.map(({ id, card: c }) => (
            <TableHead key={id} className={cn("h-auto min-w-36 py-3 align-top", pick(id))}>
              {winner?.cardId === id && (
                <Badge className="mb-2 w-fit">
                  Our pick for your spending
                  {winner.marginCents > 0 ? `: +${formatCentsWhole(winner.marginCents)}/yr` : ""}
                </Badge>
              )}
              {c ? (
                <div className="space-y-1.5">
                  <CardArt card={c} issuerName={issuers.get(c.issuerId)?.name ?? ""} className="w-24" />
                  <div className="font-semibold leading-snug text-foreground">{c.name}</div>
                  <div className="text-xs font-normal">
                    {issuers.get(c.issuerId)?.name} ·{" "}
                    {c.annualFeeCents === 0 ? "No fee" : `${formatCentsWhole(c.annualFeeCents)} fee`}
                    {c.firstYearFeeWaived && c.annualFeeCents > 0 ? " (waived year 1)" : ""}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StalenessBadge lastVerifiedAt={c.lastVerifiedAt} kind="cards" now={now} />
                    <SampleBadge isSample={c.isSample} />
                  </div>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => onRemove(c.id)}>
                    Remove<span className="sr-only"> {c.name}</span>
                  </Button>
                </div>
              ) : (
                <div className="font-semibold leading-snug text-foreground">Flat 2% cash back (baseline)</div>
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="text-xs">
        {section("Card details")}
        {row("Earn rates", ({ card: c }) => {
          if (!c) return "2% on everything";
          const cur = currencies.get(c.rewardCurrencyId);
          return (
            <ul className="space-y-0.5">
              {c.earnRules.map((r, i) => (
                <li key={i}>{ruleText(c, r, cur)}</li>
              ))}
              <li>Everything else: {unit(cur, c.baseMultiplier)}</li>
            </ul>
          );
        })}
        {row("Credits", ({ card: c }) =>
          !c || c.credits.length === 0 ? (
            "None"
          ) : (
            <ul className="space-y-0.5">
              {c.credits.map((cr) => (
                <li key={cr.id}>
                  {cr.name}: {formatCentsWhole(cr.annualValueCents)}/yr
                </li>
              ))}
            </ul>
          ),
        )}
        {row("Sign-up bonus", ({ card: c }) => {
          const b = c?.signupBonus;
          if (!b) return "None";
          const cur = currencies.get(b.currencyId);
          return `${cur?.kind === "cash" ? `${formatCentsWhole(b.amount)} cash back` : `${b.amount.toLocaleString("en-US")} ${cur?.name ?? b.currencyId}`} after ${formatCentsWhole(b.minSpendCents)} in ${b.windowDays} days`;
        })}
        {analysis && (
          <>
            {section(`Your value, ${firstYear ? "first year" : "ongoing year"}`)}
            {spendRows.map((base) => (
              <Fragment key={base.category}>
                {row(
                  <>
                    {CATEGORY_LABELS[base.category]}
                    <span className="block font-normal">{formatCentsWhole(base.annualSpendCents)}/yr</span>
                  </>,
                  ({ res }) => {
                    const line = res?.categories.find((x) => x.category === base.category);
                    return (
                      <>
                        <span className="text-sm">{formatCentsWhole(line?.valueCents ?? 0)}</span>
                        <span className="block text-muted-foreground">
                          {rate(line?.effectiveRateBps ?? 0)}
                          {line?.capHit && " - cap hit"}
                        </span>
                      </>
                    );
                  },
                )}
              </Fragment>
            ))}
            {spendRows.length === 0 &&
              row("Spending", () => (
                <span className="text-muted-foreground">Enter some monthly spending.</span>
              ))}
            {row("Credits you use", ({ res }) => formatCentsWhole(res?.creditsCents ?? 0))}
            {firstYear &&
              row("Sign-up bonus value", ({ res }) => (
                <>
                  {formatCentsWhole(res?.bonusCents ?? 0)}
                  {res?.signupBonus && !res.signupBonus.feasible && (
                    <span className="block text-destructive">minimum spend not reached</span>
                  )}
                </>
              ))}
            {row("Annual fee", ({ res }) => `-${formatCentsWhole(res?.annualFeeCents ?? 0)}`)}
            {row(
              "Net value / year",
              ({ res }) => formatCentsWhole(res?.totalCents ?? 0),
              "text-sm font-semibold [&_th]:text-foreground",
            )}
          </>
        )}
      </TableBody>
    </Table>
  );
}
