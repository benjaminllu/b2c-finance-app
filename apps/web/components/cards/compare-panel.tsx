"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SampleBadge,
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
import { MAX_CARDS } from "./state";

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

export function CardPicker({
  cards,
  issuers,
  selected,
  onToggle,
}: {
  cards: CreditCard[];
  issuers: Map<string, Issuer>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = cards.filter(
    (c) => !needle || `${c.name} ${issuers.get(c.issuerId)?.name ?? ""}`.toLowerCase().includes(needle),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick 2 to {MAX_CARDS} cards</CardTitle>
        <CardDescription>{selected.length} selected. Search by card name or issuer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="card-search">Search cards</Label>
          <Input
            id="card-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Sapphire, Amex"
          />
        </div>
        <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Cards">
          {shown.map((c) => {
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
                  <span>
                    {c.name}
                    <span className="block text-xs text-muted-foreground">
                      {issuers.get(c.issuerId)?.name}
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
  onRemove,
}: {
  cards: CreditCard[];
  issuers: Map<string, Issuer>;
  currencies: Map<string, RewardCurrency>;
  now: Date;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const cur = currencies.get(c.rewardCurrencyId);
        const bonusCur = c.signupBonus && currencies.get(c.signupBonus.currencyId);
        return (
          <Card key={c.id}>
            <CardHeader>
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
