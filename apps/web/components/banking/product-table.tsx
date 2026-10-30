"use client";

import {
  Input,
  Label,
  SampleBadge,
  StalenessBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@optima/ui";
import type { Bank, DepositProduct } from "@optima/core";
import { projectGrowth } from "@optima/core/banking";
import { formatBps, formatCents, formatCentsWhole } from "@/lib/format";

export type SortKey = "name" | "apy" | "open" | "minApy" | "fee" | "earned";
export type Row = { product: DepositProduct; bank: Bank | undefined; balanceCents: number };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Account" },
  { key: "apy", label: "APY" },
  { key: "open", label: "Min to open" },
  { key: "minApy", label: "Min for APY" },
  { key: "fee", label: "Monthly fee" },
  { key: "earned", label: "Earned in 12 mo" },
];

const topApy = (p: DepositProduct) => Math.max(...p.apyTiers.map((t) => t.apyBps));

function earned12(r: Row): number | null {
  if (r.balanceCents <= 0 || r.balanceCents < r.product.minOpenCents) return null;
  const g = projectGrowth(r.product, { principalCents: r.balanceCents, horizonDays: 365 });
  return g.interestCents - g.feesCents;
}

const value: Record<SortKey, (r: Row) => number | string> = {
  name: (r) => `${r.bank?.name ?? ""} ${r.product.name}`,
  apy: (r) => topApy(r.product),
  open: (r) => r.product.minOpenCents,
  minApy: (r) => r.product.minBalanceForApyCents,
  fee: (r) => r.product.monthlyFeeCents,
  earned: (r) => earned12(r) ?? -Infinity,
};

export function sortRows(rows: Row[], key: SortKey, dir: "asc" | "desc"): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value[key](a);
    const y = value[key](b);
    return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sign;
  });
}

export function ProductTable({
  rows,
  caption,
  sort,
  dir,
  onSort,
  now,
}: {
  rows: Row[];
  caption: string;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  now: Date;
}) {
  const hasBalance = rows.some((r) => r.balanceCents > 0);
  return (
    <Table>
      <caption className="mb-2 text-left text-sm text-muted-foreground">{caption}</caption>
      <TableHeader>
        <TableRow>
          {COLUMNS.filter((c) => c.key !== "earned" || hasBalance).map((c) => (
            <TableHead
              key={c.key}
              aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                onClick={() => onSort(c.key)}
                className="rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {c.label}
                {sort === c.key ? (dir === "asc" ? " (up)" : " (down)") : ""}
              </button>
            </TableHead>
          ))}
          <TableHead>Insurer</TableHead>
          <TableHead>Verified</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const p = r.product;
          const e = earned12(r);
          return (
            <TableRow key={p.id}>
              <TableCell>
                <div className="font-medium">{r.bank?.name ?? p.bankId}</div>
                <div className="text-muted-foreground">
                  {p.name}
                  {p.cdTermMonths ? ` (${p.cdTermMonths} mo)` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.bank?.onlineOnly ? "Online only" : "Has branches"}
                  {r.bank?.membershipRequirement ? ` · Membership: ${r.bank.membershipRequirement}` : ""}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">
                {p.apyTiers.length > 1 ? `Up to ${formatBps(topApy(p))}` : formatBps(topApy(p))}
                {p.apyTiers.length > 1 && (
                  <div className="text-xs text-muted-foreground">
                    {p.tierMode === "blended" ? "blended tiers" : "tiered by balance"}
                  </div>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{formatCentsWhole(p.minOpenCents)}</TableCell>
              <TableCell className="tabular-nums">{formatCentsWhole(p.minBalanceForApyCents)}</TableCell>
              <TableCell className="tabular-nums">
                {p.monthlyFeeCents === 0 ? "None" : formatCents(p.monthlyFeeCents)}
                {p.monthlyFeeCents > 0 && p.feeWaivers.length > 0 && (
                  <div className="text-xs text-muted-foreground">Waivable</div>
                )}
              </TableCell>
              {hasBalance && (
                <TableCell className="tabular-nums">
                  {e === null ? <span className="text-muted-foreground">Below minimum</span> : formatCents(e)}
                </TableCell>
              )}
              <TableCell>{r.bank?.insurer ?? "?"}</TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <StalenessBadge lastVerifiedAt={p.lastVerifiedAt} kind="rates" now={now} />
                  <SampleBadge isSample={p.isSample} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground">
              No accounts match these filters.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function BalanceBox({ value: v, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="table-balance">Your balance ($): re-ranks by dollars earned</Label>
      <Input id="table-balance" inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
