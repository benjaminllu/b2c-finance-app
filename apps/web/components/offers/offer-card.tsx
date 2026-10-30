"use client";

import { useId, useState } from "react";
import type { BonusOffer } from "@optima/core";
import type { EligibilityResult } from "@optima/core/eligibility";
import {
  daysUntil,
  trackerStatus,
  type OfferNetValue,
  type ParkedCashComparison,
  type TrackerEntry,
} from "@optima/core/offers";
import { Badge, Button, Card, CardContent, Input, Label, SampleBadge, StalenessBadge } from "@optima/ui";
import { formatCents, formatCentsWhole } from "@/lib/format";
import { dollarsToCents } from "../banking/use-url-state";

const usd = formatCentsWhole;

export function requirementLines(o: BonusOffer): string[] {
  const r = o.requirements;
  const out: string[] = [];
  if (r.minSpendCents !== null)
    out.push(`Spend ${usd(r.minSpendCents)}${r.spendWindowDays ? ` within ${r.spendWindowDays} days` : ""}`);
  if (r.directDepositTotalCents !== null || r.directDepositCount !== null) {
    const parts = [
      r.directDepositTotalCents !== null ? `${usd(r.directDepositTotalCents)} in direct deposits` : null,
      r.directDepositCount !== null
        ? `${r.directDepositCount} deposit${r.directDepositCount === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    out.push(
      `${parts.join(", ")}${r.directDepositWindowDays ? ` within ${r.directDepositWindowDays} days` : ""}`,
    );
  }
  if (r.minDepositCents !== null) out.push(`Deposit ${usd(r.minDepositCents)} of new money`);
  if (r.minBalanceCents !== null)
    out.push(
      `Keep ${usd(r.minBalanceCents)} balance${r.holdingPeriodDays ? ` for ${r.holdingPeriodDays} days` : ""}`,
    );
  else if (r.holdingPeriodDays) out.push(`Keep the account open ${r.holdingPeriodDays} days`);
  return [...out, ...r.other];
}

function Progress({
  label,
  done,
  target,
  left,
}: {
  label: string;
  done: number;
  target: number;
  left: number;
}) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>
          {formatCents(done)} of {formatCents(target)} ({pct}%){left === 0 ? " - done" : ""}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Tracker({
  offer,
  entry,
  put,
  today,
}: {
  offer: BonusOffer;
  entry: TrackerEntry | undefined;
  put: (offerId: string, e: TrackerEntry | null) => void;
  today: string;
}) {
  const uid = useId();
  const [date, setDate] = useState(today);
  if (!entry) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-d`}>Date applied</Label>
          <Input
            id={`${uid}-d`}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!date}
          onClick={() =>
            put(offer.id, { offerId: offer.id, appliedAt: date, spentCents: 0, directDepositCents: 0 })
          }
        >
          Track this offer
        </Button>
      </div>
    );
  }
  const status = trackerStatus(offer, entry, today);
  const r = offer.requirements;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Applied {entry.appliedAt}
        {status.deadline ? `; requirements due ${status.deadline}` : ""}.
      </p>
      {status.progress.map((p) => (
        <Progress
          key={p.label}
          label={p.label}
          done={p.doneCents}
          target={p.targetCents}
          left={p.leftCents}
        />
      ))}
      {status.reminders.length > 0 && (
        <ul className="list-disc pl-5 text-sm" aria-label="Reminders">
          {status.reminders.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {r.minSpendCents !== null && (
          <div className="space-y-1">
            <Label htmlFor={`${uid}-s`}>Spent so far ($)</Label>
            <Input
              id={`${uid}-s`}
              inputMode="decimal"
              defaultValue={entry.spentCents ? String(entry.spentCents / 100) : ""}
              onBlur={(e) => put(offer.id, { ...entry, spentCents: dollarsToCents(e.target.value) })}
            />
          </div>
        )}
        {r.directDepositTotalCents !== null && (
          <div className="space-y-1">
            <Label htmlFor={`${uid}-dd`}>Direct deposited so far ($)</Label>
            <Input
              id={`${uid}-dd`}
              inputMode="decimal"
              defaultValue={entry.directDepositCents ? String(entry.directDepositCents / 100) : ""}
              onBlur={(e) => put(offer.id, { ...entry, directDepositCents: dollarsToCents(e.target.value) })}
            />
          </div>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => put(offer.id, null)}>
          Stop tracking
        </Button>
      </div>
    </div>
  );
}

export function OfferCard({
  offer,
  institution,
  net,
  parked,
  eligibility,
  entry,
  put,
  today,
  nowIso,
}: {
  offer: BonusOffer;
  institution: string;
  net: OfferNetValue;
  parked: ParkedCashComparison | null;
  eligibility: EligibilityResult | undefined;
  entry: TrackerEntry | undefined;
  put: (offerId: string, e: TrackerEntry | null) => void;
  today: string;
  nowIso: string;
}) {
  const left = offer.expiresAt ? daysUntil(offer.expiresAt, today) : null;
  const reqs = requirementLines(offer);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{offer.title}</h3>
            <p className="text-sm text-muted-foreground">{institution}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{formatCents(net.netCents)}</p>
            <p className="text-xs text-muted-foreground">net value</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StalenessBadge lastVerifiedAt={offer.lastVerifiedAt} kind="offers" now={new Date(nowIso)} />
          <SampleBadge isSample={offer.isSample} />
          {offer.isAffiliate && <Badge variant="outline">Affiliate link</Badge>}
          {left !== null && (
            <Badge variant={left <= 14 ? "warning" : "outline"}>
              {left === 0 ? "Expires today" : `Expires ${offer.expiresAt} (${left} days left)`}
            </Badge>
          )}
          {left === null && <Badge variant="outline">No listed expiry</Badge>}
          <Badge variant="outline">
            {offer.eligibleStates ? `States: ${offer.eligibleStates.join(", ")}` : "Available nationwide"}
          </Badge>
        </div>

        {eligibility && !eligibility.eligible && (
          <div role="note" className="rounded-md border border-warning bg-warning/15 p-3 text-sm">
            <p className="font-medium">You are likely ineligible (based on your account history)</p>
            <ul className="list-disc pl-5">
              {eligibility.issues.map((i, n) => (
                <li key={`${i.ruleId}-${n}`}>
                  {i.reason}{" "}
                  {i.eligibleFrom
                    ? `Eligible from ${i.eligibleFrom}.`
                    : "Not on its own: this does not clear with time."}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reqs.length > 0 && (
          <div>
            <p className="text-sm font-medium">Requirements</p>
            <ul className="list-disc pl-5 text-sm">
              {reqs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {parked && (
          <p className="rounded-md bg-muted p-3 text-sm">
            <strong>Parked cash:</strong> {parked.summary}
          </p>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium">Show the math</summary>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Net value breakdown</caption>
            <tbody>
              {net.breakdown.map((l) => (
                <tr key={l.key} className="border-b last:border-0">
                  <th scope="row" className="py-1 text-left font-normal">
                    {l.label}
                  </th>
                  <td className="py-1 text-right">{formatCents(l.cents)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-1 text-left">
                  Net value
                </th>
                <td className="py-1 text-right font-semibold">{formatCents(net.netCents)}</td>
              </tr>
            </tbody>
          </table>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            {net.explanation.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>

        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {entry ? "Your progress" : "Track your progress"}
          </summary>
          <div className="mt-2">
            <Tracker offer={offer} entry={entry} put={put} today={today} />
          </div>
        </details>

        <p className="text-sm">
          <a className="underline" href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
