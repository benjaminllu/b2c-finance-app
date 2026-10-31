"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SampleBadge,
  Select,
  StalenessBadge,
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

export function CompareColumns({
  cards,
  issuers,
  currencies,
  now,
  winner,
  onRemove,
}: {
  /** Shown in this (selection) order; the winner is highlighted wherever it sits. */
  cards: CreditCard[];
  issuers: Map<string, Issuer>;
  currencies: Map<string, RewardCurrency>;
  now: Date;
  winner: { cardId: string; marginCents: number } | null;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const cur = currencies.get(c.rewardCurrencyId);
        const bonusCur = c.signupBonus && currencies.get(c.signupBonus.currencyId);
        const top = winner?.cardId === c.id;
        return (
          <Card key={c.id} className={top ? "relative border-primary ring-2 ring-primary" : undefined}>
            <CardHeader>
              {/* Sits on the border so the highlighted column stays aligned with the others. */}
              {top && (
                <Badge className="absolute -top-3 left-4 w-fit">
                  Our pick for your spending
                  {winner.marginCents > 0 ? `: +${formatCentsWhole(winner.marginCents)}/yr` : ""}
                </Badge>
              )}
              <CardArt card={c} issuerName={issuers.get(c.issuerId)?.name ?? ""} className="w-40" />
              <CardTitle className="leading-snug">{c.name}</CardTitle>
              <CardDescription>
                {issuers.get(c.issuerId)?.name} - earns {cur?.name ?? c.rewardCurrencyId}
              </CardDescription>
              <div className="flex flex-wrap gap-1.5">
                <StalenessBadge lastVerifiedAt={c.lastVerifiedAt} kind="cards" now={now} />
                <SampleBadge isSample={c.isSample} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <h4 className="font-medium">Annual fee</h4>
                <p>
                  {c.annualFeeCents === 0 ? "None" : formatCentsWhole(c.annualFeeCents)}
                  {c.firstYearFeeWaived && c.annualFeeCents > 0 ? " (waived the first year)" : ""}
                </p>
              </div>
              <div>
                <h4 className="font-medium">Earn rates</h4>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {c.earnRules.map((r, i) => (
                    <li key={i}>{ruleText(c, r, cur)}</li>
                  ))}
                  <li>Everything else: {unit(cur, c.baseMultiplier)}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium">Credits</h4>
                {c.credits.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {c.credits.map((cr) => (
                      <li key={cr.id}>
                        {cr.name}: {formatCentsWhole(cr.annualValueCents)}/yr face value
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="font-medium">Sign-up bonus</h4>
                {c.signupBonus ? (
                  <p className="text-muted-foreground">
                    {bonusCur?.kind === "cash"
                      ? `${formatCentsWhole(c.signupBonus.amount)} cash back`
                      : `${c.signupBonus.amount.toLocaleString("en-US")} ${bonusCur?.name ?? c.signupBonus.currencyId}`}{" "}
                    after {formatCentsWhole(c.signupBonus.minSpendCents)} in {c.signupBonus.windowDays} days
                  </p>
                ) : (
                  <p className="text-muted-foreground">None</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => onRemove(c.id)}>
                Remove<span className="sr-only"> {c.name}</span>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
