"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@optima/ui";
import type { Bank, DepositProduct } from "@optima/core";
import { buildCdLadder } from "@optima/core/banking";
import { formatBps, formatCents } from "@/lib/format";
import { clampInt } from "./use-url-state";

export function LadderBuilder({
  cds,
  banks,
  amountCents,
  rungs,
  spacing,
  startDate,
  onChange,
}: {
  cds: DepositProduct[];
  banks: Map<string, Bank>;
  amountCents: number;
  rungs: string;
  spacing: string;
  startDate: string;
  onChange: (patch: { rungs?: string; spacing?: string }) => void;
}) {
  const ladder = buildCdLadder({
    amountCents,
    rungs: clampInt(rungs, 1, 10, 4),
    spacingMonths: clampInt(spacing, 1, 24, 3),
    startDate,
    cds,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>CD ladder builder</CardTitle>
        <CardDescription>
          Splits the amount above evenly across rungs of growing terms, so one CD matures every few months.
          Each rung uses the available CD with the closest term (higher APY wins ties).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ladder-rungs">Number of rungs</Label>
            <Input
              id="ladder-rungs"
              type="number"
              min={1}
              max={10}
              value={rungs}
              onChange={(e) => onChange({ rungs: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ladder-spacing">Months between rungs</Label>
            <Input
              id="ladder-spacing"
              type="number"
              min={1}
              max={24}
              value={spacing}
              onChange={(e) => onChange({ spacing: e.target.value })}
            />
          </div>
        </div>
        <Table>
          <caption className="mb-2 text-left text-sm text-muted-foreground">
            Ladder opened {startDate}. Maturity values assume each CD is held to term.
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Rung</TableHead>
              <TableHead>CD</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>APY</TableHead>
              <TableHead>Matures</TableHead>
              <TableHead>Value at maturity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ladder.rungs.map((r) => (
              <TableRow key={r.rung}>
                <TableCell>{r.rung}</TableCell>
                <TableCell>
                  {r.product
                    ? `${banks.get(r.product.bankId)?.name ?? r.product.bankId}: ${r.product.name}`
                    : "None available"}
                  {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                </TableCell>
                <TableCell className="tabular-nums">{formatCents(r.amountCents)}</TableCell>
                <TableCell className="tabular-nums">
                  {r.apyBps === null ? "n/a" : formatBps(r.apyBps)}
                </TableCell>
                <TableCell>{r.maturityDate ?? "n/a"}</TableCell>
                <TableCell className="tabular-nums">{formatCents(r.maturityValueCents)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={5}>Total (interest {formatCents(ladder.totalInterestCents)})</TableCell>
              <TableCell className="tabular-nums">{formatCents(ladder.totalMaturityValueCents)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
