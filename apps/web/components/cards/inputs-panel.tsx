"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from "@optima/ui";
import { CATEGORIES, CATEGORY_LABELS, type CreditCard, type RewardCurrency } from "@optima/core";
import { effectiveAnnualFee } from "@optima/core/cards";
import { formatCentsWhole } from "@/lib/format";
import { usageOf } from "./analysis";
import { PRESETS, type CardsState } from "./state";

type Patch = (p: Partial<CardsState>) => void;

export function SpendEditor({ state, patch }: { state: CardsState; patch: Patch }) {
  const total = CATEGORIES.reduce((s, c) => s + state.spend[c], 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your monthly spending</CardTitle>
        <CardDescription>
          Dollars per month. Total {formatCentsWhole(total)}/month. The presets are examples, not averages for
          any real group.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Example spending presets">
          {PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => patch({ spend: { ...p.spend } })}>
              {p.label} (example)
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div key={c} className="space-y-1.5">
              <Label htmlFor={`spend-${c}`}>{CATEGORY_LABELS[c]}</Label>
              <Input
                id={`spend-${c}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={10}
                value={state.spend[c] / 100}
                onChange={(e) =>
                  patch({
                    spend: {
                      ...state.spend,
                      [c]: Math.round(Math.max(0, Number(e.target.value) || 0) * 100),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Per-credit "use fully / partly / never", with the resulting real annual fee per card. */
export function CreditCheck({
  cards,
  state,
  patch,
}: {
  cards: CreditCard[];
  state: CardsState;
  patch: Patch;
}) {
  const setPercent = (id: string, p: number) => {
    const next = { ...state.creditPercent };
    if (p > 0) next[id] = Math.min(100, p);
    else delete next[id];
    patch({ creditPercent: next });
  };
  const usage = Object.fromEntries(Object.entries(state.creditPercent).map(([id, p]) => [id, usageOf(p)]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit-use reality check</CardTitle>
        <CardDescription>
          Credits only count when you say you will use them. Be honest: a credit you never use is not a
          discount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {cards.map((card) => {
          const fee = effectiveAnnualFee(card, usage);
          return (
            <section key={card.id} aria-labelledby={`cc-${card.id}`} className="space-y-3">
              <h4 id={`cc-${card.id}`} className="font-medium">
                {card.name}
              </h4>
              {card.credits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No statement credits.</p>
              ) : (
                <ul className="space-y-3">
                  {card.credits.map((cr) => {
                    const p = state.creditPercent[cr.id] ?? 0;
                    const mode = p >= 100 ? "full" : p <= 0 ? "never" : "partial";
                    return (
                      <li key={cr.id} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                        <div>
                          <Label htmlFor={`use-${cr.id}`}>
                            {cr.name} ({formatCentsWhole(cr.annualValueCents)}/yr)
                          </Label>
                          {cr.usageConstraints && (
                            <p className="mt-1 text-xs text-muted-foreground">{cr.usageConstraints}</p>
                          )}
                        </div>
                        <Select
                          id={`use-${cr.id}`}
                          className="sm:w-40"
                          value={mode}
                          onChange={(e) =>
                            setPercent(
                              cr.id,
                              e.target.value === "full" ? 100 : e.target.value === "partial" ? 50 : 0,
                            )
                          }
                        >
                          <option value="never">Never use</option>
                          <option value="partial">Use partly</option>
                          <option value="full">Use fully</option>
                        </Select>
                        {mode === "partial" && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              aria-label={`Percent of ${cr.name} you use`}
                              className="w-20"
                              type="number"
                              min={1}
                              max={99}
                              value={p}
                              onChange={(e) => setPercent(cr.id, Math.round(Number(e.target.value) || 0))}
                            />
                            <span className="text-sm">%</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <Alert>
                <strong>Real annual fee: {formatCentsWhole(fee.effectiveFeeCents)}</strong> (sticker fee{" "}
                {formatCentsWhole(fee.annualFeeCents)} minus {formatCentsWhole(fee.creditsUsedCents)} of
                credits you use).
              </Alert>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ValuationInputs({
  cards,
  currencies,
  state,
  patch,
}: {
  cards: CreditCard[];
  currencies: Map<string, RewardCurrency>;
  state: CardsState;
  patch: Patch;
}) {
  const ids = [...new Set(cards.flatMap((c) => [c.rewardCurrencyId, c.signupBonus?.currencyId ?? ""]))];
  const used = ids.flatMap((id) => {
    const cur = currencies.get(id);
    return cur && cur.kind !== "cash" ? [cur] : [];
  });
  if (used.length === 0) return null;
  const set = (cur: RewardCurrency, v: number) => {
    const next = { ...state.centsPerPoint };
    if (v > 0 && v !== cur.defaultCentsPerPoint) next[cur.id] = v;
    else delete next[cur.id];
    patch({ centsPerPoint: next });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>What a point is worth to you</CardTitle>
        <CardDescription>
          Cents per point or mile. The default and its source are shown; change it to match how you redeem.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {used.map((cur) => (
          <div key={cur.id} className="space-y-1.5">
            <Label htmlFor={`cpp-${cur.id}`}>{cur.name} (cents per point)</Label>
            <Input
              id={`cpp-${cur.id}`}
              type="number"
              min={0.1}
              step={0.05}
              value={state.centsPerPoint[cur.id] ?? cur.defaultCentsPerPoint}
              onChange={(e) => set(cur, Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Default {cur.defaultCentsPerPoint}c. {cur.valuationSource}{" "}
              {cur.valuationSourceUrl && (
                <a className="underline" href={cur.valuationSourceUrl} target="_blank" rel="noreferrer">
                  Source
                </a>
              )}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
