"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@optima/ui";
import type { CreditCard, Issuer, RewardCurrency } from "@optima/core";
import { analyze, buildOptions } from "./analysis";
import { BreakEvenChart, SensitivityPanel } from "./charts";
import { CardPicker, CompareColumns } from "./compare-panel";
import { CreditCheck, SpendEditor, ValuationInputs } from "./inputs-panel";
import { pickerRows } from "./picker";
import { Results, ViewToggle } from "./results-panel";
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

  return (
    <div className="space-y-8">
      <CardPicker rows={rows} issuers={issuerMap} selected={state.cardIds} onToggle={toggle} />
      {selected.length > 0 && (
        <CompareColumns
          cards={selected}
          issuers={issuerMap}
          currencies={currencyMap}
          now={now}
          onRemove={toggle}
        />
      )}
      {!ready && <Alert variant="warning">Select at least two cards to see which one wins.</Alert>}

      <SpendEditor state={state} patch={patch} />
      {selected.length > 0 && <CreditCheck cards={selected} state={state} patch={patch} />}
      <ValuationInputs cards={selected} currencies={currencyMap} state={state} patch={patch} />

      {analysis && (
        <section className="space-y-6" aria-labelledby="results-heading">
          <div className="space-y-3">
            <h2 id="results-heading" className="text-xl font-semibold tracking-tight">
              Results
            </h2>
            <ViewToggle state={state} patch={patch} />
          </div>
          <Results a={analysis} state={state} cards={selected} />
          <BreakEvenChart
            cards={selected}
            baseline={analysis.baseline}
            spend={state.spend}
            options={analysis.options}
          />
          <SensitivityPanel
            cards={selected}
            baseline={analysis.baseline}
            spend={state.spend}
            options={analysis.options}
            currencies={currencyMap}
          />
        </section>
      )}
    </div>
  );
}
