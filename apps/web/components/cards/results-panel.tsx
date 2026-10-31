"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@optima/ui";
import { CATEGORY_LABELS, type CreditCard } from "@optima/core";
import { formatCentsWhole } from "@/lib/format";
import type { Analysis } from "./analysis";
import type { CardsState } from "./state";

export function ViewToggle({ state, patch }: { state: CardsState; patch: (p: Partial<CardsState>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Value view">
      <Button
        variant={state.view === "ongoing" ? "default" : "outline"}
        size="sm"
        aria-pressed={state.view === "ongoing"}
        onClick={() => patch({ view: "ongoing" })}
      >
        Ongoing year
      </Button>
      <Button
        variant={state.view === "first_year" ? "default" : "outline"}
        size="sm"
        aria-pressed={state.view === "first_year"}
        onClick={() => patch({ view: "first_year" })}
      >
        First year (with sign-up bonus)
      </Button>
    </div>
  );
}

export function WinnerSummary({ a, firstYear }: { a: Analysis; firstYear: boolean }) {
  const infeasible = firstYear ? a.rows.filter((r) => r.feasibility && !r.feasibility.feasible) : [];
  return (
    <div className="space-y-3">
      {a.winner && (
        <Card>
          <CardHeader>
            <CardTitle>
              Winner: {a.winner.name} <Badge className="align-middle">Best of your selection</Badge>
            </CardTitle>
            <CardDescription>
              {firstYear ? "First year" : "Ongoing year"}, net of fees, for your monthly spending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-base">{a.winner.reason}</p>
            <p className="text-muted-foreground">
              {a.winner.baselineDeltaCents >= 0
                ? `That is ${formatCentsWhole(a.winner.baselineDeltaCents)} a year more than a flat 2% cash back card.`
                : `A flat 2% cash back card would still beat every card you selected, by ${formatCentsWhole(-a.winner.baselineDeltaCents)} a year over the winner.`}
            </p>
          </CardContent>
        </Card>
      )}

      {infeasible.map((r) => (
        <Alert key={r.card.id} variant="warning">
          <strong>{r.card.name}: sign-up bonus may be out of reach.</strong> It needs{" "}
          {formatCentsWhole(r.feasibility!.minSpendCents)} in {r.feasibility!.windowDays} days, but your
          spending projects to {formatCentsWhole(r.feasibility!.projectedSpendCents)}. You would need about{" "}
          {formatCentsWhole(r.feasibility!.extraMonthlySpendCents)} more per month. The first-year numbers
          still count the bonus ({formatCentsWhole(r.result.bonusCents)}).
        </Alert>
      ))}
    </div>
  );
}

export function BreakEvens({ a, cards }: { a: Analysis; cards: CreditCard[] }) {
  const names = new Map(cards.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Break-even spending</CardTitle>
          <CardDescription>
            Where one card overtakes another as spending in a single category grows, with everything else held
            at your numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {a.breakEvens.map((p) => (
            <div key={`${p.a.id}-${p.b.id}`}>
              <h4 className="font-medium">
                {p.a.name} vs {p.b.name}
              </h4>
              {p.items.length === 0 ? (
                <p className="text-muted-foreground">
                  No category flips this pair: the same card wins at every spend level.
                </p>
              ) : (
                <ul className="list-disc pl-5">
                  {p.items.map((i, k) => (
                    <li key={k}>{i.text}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit use needed</CardTitle>
            <CardDescription>
              Share of each card&apos;s credits you must use to match its best rival.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {a.rows.map((r) => {
              const u = r.utilBreakEven;
              const rival = names.get(r.against.id) ?? "a flat 2% card";
              return (
                <p key={r.card.id}>
                  <strong>{r.card.name}:</strong>{" "}
                  {!u
                    ? "has no credits, so nothing to use."
                    : u.status === "wins_at_zero"
                      ? `beats ${rival} without using any credits.`
                      : u.status === "needs_utilization"
                        ? `you must use ${Math.ceil((u.utilization ?? 0) * 100)}% of its credits (${formatCentsWhole(u.creditsUsedCents ?? 0)} of ${formatCentsWhole(u.creditFaceValueCents)}) to match ${rival}.`
                        : `loses to ${rival} by ${formatCentsWhole(u.shortfallAtFullCents)} even if you use every credit.`}
                </p>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Highest fee worth paying</CardTitle>
            <CardDescription>The most each card could charge and still tie a flat 2% card.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {a.rows.map((r) => {
              const f = r.feeBreakEven;
              return (
                <p key={r.card.id}>
                  <strong>{r.card.name}:</strong>{" "}
                  {f.maxAnnualFeeCents < 0
                    ? `trails a flat 2% card by ${formatCentsWhole(-f.maxAnnualFeeCents)} even with no fee.`
                    : `worth paying up to ${formatCentsWhole(f.maxAnnualFeeCents)} a year; it charges ${formatCentsWhole(f.currentAnnualFeeCents)} (${f.beatsBaseline ? "beats" : "trails"} the baseline in this view).`}
                </p>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function BestWallet({ a, cards }: { a: Analysis; cards: CreditCard[] }) {
  const names = new Map(cards.map((c) => [c.id, c.name]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Best wallet: use the cards together</CardTitle>
        <CardDescription>
          Each purchase goes to the card that earns the most on it; fees and credits are counted once per
          card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-base">
          Together: {formatCentsWhole(a.wallet.totalNetCents)} a year.{" "}
          {a.wallet.gainOverBestSingleCents > 0
            ? `That is ${formatCentsWhole(a.wallet.gainOverBestSingleCents)} more than using only ${names.get(a.wallet.bestSingleCardId)}, the best single card.`
            : `No gain over ${names.get(a.wallet.bestSingleCardId)} alone: the extra fees cost as much as the extra rewards.`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Category</TableHead>
              <TableHead scope="col">Put it on</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {a.wallet.assignments
              .filter((x) => x.annualSpendCents > 0)
              .map((x) => (
                <TableRow key={x.category}>
                  <TableCell>{CATEGORY_LABELS[x.category]}</TableCell>
                  <TableCell>
                    {x.splits
                      .map(
                        (s) =>
                          `${names.get(s.cardId)}${x.splits.length > 1 ? ` (${Math.round(s.share * 100)}%)` : ""}`,
                      )
                      .join(", ")}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
