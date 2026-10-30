"use client";

import {
  SampleBadge,
  StalenessBadge,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@optima/ui";
import type { Bank } from "@optima/core";
import type { RankedOption, RankResult } from "@optima/core/banking";
import { formatBps, formatCents } from "@/lib/format";

function optionTitle(o: RankedOption, banks: Map<string, Bank>) {
  if (o.offer) return `${banks.get(o.offer.institutionId)?.name ?? o.offer.institutionId}: ${o.offer.title}`;
  const p = o.product;
  return p ? `${banks.get(p.bankId)?.name ?? p.bankId}: ${p.name}` : o.id;
}

function ShowTheMath({ o }: { o: RankedOption }) {
  const r = o.result;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Show the math
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        {r.explanation.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <dl className="mt-3 max-w-sm space-y-1">
        {r.breakdown.map((b) => (
          <div key={b.key} className="flex justify-between gap-4">
            <dt>{b.label}</dt>
            <dd className="tabular-nums">{formatCents(b.cents)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
          <dt>Net over lock-up</dt>
          <dd className="tabular-nums">{formatCents(r.netEarningsCents)}</dd>
        </div>
      </dl>
      {r.apyNote && <p className="mt-2 text-muted-foreground">{r.apyNote}</p>}
    </details>
  );
}

export function CashPanel({
  rank,
  banks,
  amount,
  months,
  onChange,
  now,
}: {
  rank: RankResult;
  banks: Map<string, Bank>;
  amount: string;
  months: string;
  onChange: (patch: { amount?: string; months?: string }) => void;
  now: Date;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where should my cash go?</CardTitle>
        <CardDescription>
          Every option is scored on net dollars over your lock-up, after fees and early-closure costs. Bank
          bonuses are annualized simply (net / cash tied up x 365 / days).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cash-amount">Amount to park ($)</Label>
            <Input
              id="cash-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-months">How long you can lock it up (months)</Label>
            <Input
              id="cash-months"
              type="number"
              min={1}
              max={120}
              value={months}
              onChange={(e) => onChange({ months: e.target.value })}
            />
          </div>
        </div>

        <ol className="space-y-3" aria-label="Ranked cash options">
          {rank.ranked.map((o, i) => (
            <li key={`${o.kind}-${o.id}`} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-medium">
                    <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                    {optionTitle(o, banks)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {o.kind === "bonus" ? "Bank bonus" : (o.product?.type ?? "").replace("_", " ")}
                    </Badge>
                    <StalenessBadge
                      lastVerifiedAt={(o.offer ?? o.product)?.lastVerifiedAt ?? ""}
                      kind={o.kind === "bonus" ? "offers" : "rates"}
                      now={now}
                    />
                    <SampleBadge isSample={(o.offer ?? o.product)?.isSample ?? false} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCents(o.result.netEarningsCents)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {o.result.effectiveApyBps === null
                      ? "APY n/a: no cash parked"
                      : `${formatBps(o.result.effectiveApyBps)} effective APY`}
                  </p>
                </div>
              </div>
              <ShowTheMath o={o} />
            </li>
          ))}
          {rank.ranked.length === 0 && (
            <li className="text-sm text-muted-foreground">Nothing fits those inputs.</li>
          )}
        </ol>

        {rank.excluded.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {rank.excluded.length} options left out, and why
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {rank.excluded.map((o) => (
                <li key={`${o.kind}-${o.id}`}>
                  <span className="font-medium text-foreground">{optionTitle(o, banks)}</span>:{" "}
                  {o.result.infeasibleReason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
