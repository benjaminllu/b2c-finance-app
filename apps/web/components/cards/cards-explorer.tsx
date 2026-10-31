"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Tabs, TabsContent, TabsList, TabsTrigger } from "@optima/ui";
import type { CreditCard, Issuer, RewardCurrency } from "@optima/core";
import { analyze, buildOptions } from "./analysis";
import { BreakEvenChart, SensitivityPanel } from "./charts";
import { CardPicker, CompareTable } from "./compare-panel";
import { CreditCheck, SpendEditor, ValuationInputs } from "./inputs-panel";
import { pickerRows } from "./picker";
import { BestWallet, BreakEvens, ViewToggle, WinnerSummary } from "./results-panel";
import { decodeState, encodeState, MAX_CARDS, type CardsState } from "./state";

export function CardsExplorer({
  cards,
  issuers,
  currencies,
  nowIso,
}: {
  cards: CreditCard[];
  issuers: Issuer[];
  currencies: RewardCurrency[];
  nowIso: string;
}) {
  const params = useSearchParams();
  const [state, setState] = useState<CardsState>(() => decodeState(params, new Set(cards.map((c) => c.id))));
  const patch = useCallback((p: Partial<CardsState>) => setState((prev) => ({ ...prev, ...p })), []);

  useEffect(() => {
    const qs = encodeState(state);
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [state]);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const issuerMap = useMemo(() => new Map(issuers.map((i) => [i.id, i])), [issuers]);
  const currencyMap = useMemo(() => new Map(currencies.map((c) => [c.id, c])), [currencies]);
  const selected = useMemo(
    () => state.cardIds.flatMap((id) => cards.find((c) => c.id === id) ?? []),
    [state.cardIds, cards],
  );
  const toggle = (id: string) =>
    patch({
      cardIds: state.cardIds.includes(id)
        ? state.cardIds.filter((x) => x !== id)
        : state.cardIds.length < MAX_CARDS
          ? [...state.cardIds, id]
          : state.cardIds,
    });

  const rows = useMemo(
    () => pickerRows(cards, currencyMap, state.spend, buildOptions(currencies, state)),
    [cards, currencyMap, currencies, state],
  );

  const ready = selected.length >= 2;
  const analysis = useMemo(
    () => (ready ? analyze(selected, currencies, state) : null),
    [ready, selected, currencies, state],
  );

  const firstYear = state.view === "first_year";
  const table = selected.length > 0 && (
    <CompareTable
      cards={selected}
      issuers={issuerMap}
      currencies={currencyMap}
      now={now}
      analysis={analysis}
      firstYear={firstYear}
      onRemove={toggle}
    />
  );

  return (
    <div className="space-y-6">
      <CardPicker rows={rows} issuers={issuerMap} selected={state.cardIds} onToggle={toggle} />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        {/* Inputs stay in view while the results scroll beside them. */}
        <aside
          aria-label="Your inputs"
          className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <SpendEditor state={state} patch={patch} />
          {selected.length > 0 && <CreditCheck cards={selected} state={state} patch={patch} />}
          <ValuationInputs cards={selected} currencies={currencyMap} state={state} patch={patch} />
        </aside>

        <section className="min-w-0 space-y-4" aria-labelledby="results-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-xl font-semibold tracking-tight">
              Results
            </h2>
            <ViewToggle state={state} patch={patch} />
          </div>
          {!ready && <Alert variant="warning">Select at least two cards to see which one wins.</Alert>}
          {!analysis ? (
            table
          ) : (
            <>
              <WinnerSummary a={analysis} firstYear={firstYear} />
              <Tabs defaultValue="compare">
                <TabsList className="h-auto flex-wrap">
                  <TabsTrigger value="compare">Comparison</TabsTrigger>
                  <TabsTrigger value="break-even">Break-evens</TabsTrigger>
                  <TabsTrigger value="wallet">Best wallet</TabsTrigger>
                  <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                </TabsList>
                <TabsContent value="compare">{table}</TabsContent>
                <TabsContent value="break-even" className="space-y-6">
                  <BreakEvens a={analysis} cards={selected} />
                  <BreakEvenChart
                    cards={selected}
                    baseline={analysis.baseline}
                    spend={state.spend}
                    options={analysis.options}
                  />
                </TabsContent>
                <TabsContent value="wallet">
                  <BestWallet a={analysis} cards={selected} />
                </TabsContent>
                <TabsContent value="sensitivity">
                  <SensitivityPanel
                    cards={selected}
                    baseline={analysis.baseline}
                    spend={state.spend}
                    options={analysis.options}
                    currencies={currencyMap}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
