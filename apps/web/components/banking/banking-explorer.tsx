"use client";

import { useMemo } from "react";
import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger, Input, Label } from "@optima/ui";
import type { Bank, BonusOffer, DepositProduct, DepositProductType } from "@optima/core";
import { DAYS_PER_MONTH, rankCashOptions } from "@optima/core/banking";
import { CashPanel } from "./cash-panel";
import { LadderBuilder } from "./ladder-builder";
import { ProductTable, BalanceBox, sortRows, type Row, type SortKey } from "./product-table";
import { ProjectionChart } from "./projection-chart";
import { clampInt, dollarsToCents, useUrlState } from "./use-url-state";

const DEFAULTS = {
  amount: "10000",
  months: "12",
  tab: "savings",
  sort: "apy",
  dir: "desc",
  balance: "",
  online: "0",
  open: "0",
  maxMin: "",
  rungs: "4",
  spacing: "3",
};

const TABS: { value: DepositProductType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "money_market", label: "Money market" },
  { value: "cd", label: "CDs" },
];

export function BankingExplorer({
  banks,
  products,
  offers,
  nowIso,
}: {
  banks: Bank[];
  products: DepositProduct[];
  offers: BonusOffer[];
  nowIso: string;
}) {
  const [s, update] = useUrlState(DEFAULTS);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const bankMap = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks]);
  const amountCents = dollarsToCents(s.amount);
  const months = clampInt(s.months, 1, 120, 12);

  const rank = useMemo(
    () =>
      rankCashOptions({
        products,
        offers,
        amountCents,
        horizonDays: months * DAYS_PER_MONTH,
        now,
      }),
    [products, offers, amountCents, months, now],
  );

  const names = useMemo(
    () => new Map(products.map((p) => [p.id, `${bankMap.get(p.bankId)?.name ?? p.bankId}: ${p.name}`])),
    [products, bankMap],
  );
  const depositRanked = rank.ranked.filter((o) => o.kind === "deposit");

  const balanceCents = dollarsToCents(s.balance);
  const maxMinCents = s.maxMin === "" ? Infinity : dollarsToCents(s.maxMin);
  const sort = s.sort as SortKey;
  const dir = s.dir === "asc" ? "asc" : "desc";
  const effectiveSort: SortKey = sort === "earned" && balanceCents === 0 ? "apy" : sort;

  const rowsFor = (type: DepositProductType): Row[] =>
    sortRows(
      products
        .filter((p) => p.type === type)
        .map((p) => ({ product: p, bank: bankMap.get(p.bankId), balanceCents }))
        .filter(
          (r) =>
            (s.online !== "1" || r.bank?.onlineOnly) &&
            (s.open !== "1" || !r.bank?.membershipRequirement) &&
            r.product.minOpenCents <= maxMinCents,
        ),
      effectiveSort,
      dir,
    );

  const onSort = (key: SortKey) =>
    update(
      key === effectiveSort
        ? { dir: dir === "asc" ? "desc" : "asc" }
        : { sort: key, dir: key === "name" ? "asc" : "desc" },
    );

  const cds = products.filter((p) => p.type === "cd");

  return (
    <div className="space-y-8">
      <CashPanel
        rank={rank}
        banks={bankMap}
        amount={s.amount}
        months={s.months}
        onChange={update}
        now={now}
      />

      <section aria-labelledby="compare-heading" className="space-y-4">
        <h2 id="compare-heading" className="text-xl font-semibold tracking-tight">
          Compare accounts
        </h2>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <BalanceBox
                value={s.balance}
                onChange={(balance) =>
                  update({ balance, ...(balance ? { sort: "earned", dir: "desc" } : {}) })
                }
              />
              <div className="space-y-2">
                <Label htmlFor="max-min">Max minimum deposit ($)</Label>
                <Input
                  id="max-min"
                  inputMode="decimal"
                  value={s.maxMin}
                  onChange={(e) => update({ maxMin: e.target.value })}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Filters</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.online === "1"}
                    onChange={(e) => update({ online: e.target.checked ? "1" : "0" })}
                  />
                  Online-only banks
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.open === "1"}
                    onChange={(e) => update({ open: e.target.checked ? "1" : "0" })}
                  />
                  No credit union membership rules
                </label>
              </fieldset>
            </div>
            <Tabs value={s.tab} onValueChange={(tab) => update({ tab })}>
              <TabsList className="h-auto flex-wrap">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TABS.map((t) => (
                <TabsContent key={t.value} value={t.value}>
                  <ProductTable
                    rows={rowsFor(t.value)}
                    caption={`${t.label} accounts, sorted by ${effectiveSort}. Use the column buttons to re-sort.`}
                    sort={effectiveSort}
                    dir={dir}
                    onSort={onSort}
                    now={now}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </section>

      <ProjectionChart options={depositRanked} names={names} amountCents={amountCents} months={months} />

      <LadderBuilder
        cds={cds}
        banks={bankMap}
        amountCents={amountCents}
        rungs={s.rungs}
        spacing={s.spacing}
        startDate={nowIso.slice(0, 10)}
        onChange={update}
      />
    </div>
  );
}
