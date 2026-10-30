"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Select } from "@optima/ui";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type CreditCard,
  type RewardCurrency,
  type SpendProfile,
} from "@optima/core";
import {
  annualValue,
  breakEvenSpend,
  sensitivity,
  type SensitivityVariable,
  type ValuationOptions,
} from "@optima/core/cards";
import { formatCentsWhole } from "@/lib/format";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const colorOf = (i: number, baseline: boolean) =>
  baseline ? "var(--chart-baseline)" : (COLORS[i] ?? "var(--chart-1)");
const dollars = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const axis = { fill: "currentColor", fontSize: 12 };

interface Props {
  cards: CreditCard[];
  baseline: CreditCard;
  spend: SpendProfile;
  options: ValuationOptions;
}

function LineView({
  data,
  lines,
  xLabel,
  xFormat,
  xMax,
  children,
  label,
}: {
  data: Record<string, number>[];
  lines: { key: string; name: string; color: string; dashed: boolean }[];
  xLabel: string;
  xFormat: (v: number) => string;
  xMax: number;
  children?: React.ReactNode;
  label: string;
}) {
  return (
    <div className="h-80 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 16, top: 16 }}>
          <CartesianGrid stroke="var(--chart-baseline)" strokeOpacity={0.3} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, xMax]}
            tick={axis}
            tickFormatter={xFormat}
            label={{
              value: xLabel,
              position: "insideBottom",
              offset: -4,
              fill: "currentColor",
              fontSize: 12,
            }}
          />
          <YAxis width={72} tick={axis} tickFormatter={dollars} />
          <Tooltip
            formatter={(v) => dollars(Number(v))}
            labelFormatter={(v) => `${xLabel}: ${xFormat(Number(v))}`}
          />
          <Legend verticalAlign="top" />
          {lines.map((l) => (
            <Line
              key={l.key}
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? "6 4" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function lineSpecs(all: CreditCard[], baseline: CreditCard) {
  return [...all, baseline].map((c, i) => ({
    key: `k${i}`,
    name: c.id === baseline.id ? "Flat 2% (baseline)" : c.name,
    color: colorOf(i, c.id === baseline.id),
    dashed: c.id === baseline.id,
  }));
}

/** Value of each card as monthly spend in one category grows; crossings are marked and listed. */
export function BreakEvenChart({ cards, baseline, spend, options }: Props) {
  const [category, setCategory] = useState<Category>("dining");
  const all = useMemo(() => [...cards, baseline], [cards, baseline]);

  const model = useMemo(() => {
    const crossings = cards.flatMap((a, i) =>
      cards.slice(i + 1).flatMap((b) =>
        breakEvenSpend(a, b, category, spend, options).crossings.map((x) => ({
          a,
          b,
          at: x.monthlySpendCents,
          above: x.winnerAbove === "a" ? a : b,
          below: x.winnerBelow === "a" ? a : b,
        })),
      ),
    );
    const xMax = Math.max(200_000, 1.25 * Math.max(0, ...crossings.map((c) => c.at)));
    const n = 60;
    const data = Array.from({ length: n + 1 }, (_, s) => {
      const x = (xMax * s) / n;
      const row: Record<string, number> = { x: x / 100 };
      all.forEach((c, i) => {
        row[`k${i}`] = annualValue(c, { ...spend, [category]: x }, options).totalCents / 100;
      });
      return row;
    });
    const dots = crossings.map((c) => ({
      ...c,
      y: annualValue(c.a, { ...spend, [category]: c.at }, options).totalCents / 100,
    }));
    return { crossings: dots, data, xMax: xMax / 100 };
  }, [all, cards, category, spend, options]);

  const label = CATEGORY_LABELS[category].toLowerCase();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Break-even chart</CardTitle>
        <CardDescription>
          Annual net value as your monthly {label} spending changes. All other spending stays as entered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="be-category">Category on the horizontal axis</Label>
          <Select id="be-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <LineView
          data={model.data}
          lines={lineSpecs(cards, baseline)}
          xLabel={`Monthly ${label} spend`}
          xFormat={dollars}
          xMax={model.xMax}
          label={`Line chart of annual value versus monthly ${label} spend for each selected card and a flat 2% baseline. Crossing points are listed below the chart.`}
        >
          {model.crossings.map((c, i) => (
            <ReferenceDot
              key={i}
              x={c.at / 100}
              y={c.y}
              r={5}
              fill="var(--foreground)"
              stroke="var(--background)"
              label={{
                value: `${dollars(c.at / 100)}/mo`,
                position: "top",
                fill: "currentColor",
                fontSize: 12,
              }}
            />
          ))}
        </LineView>
        <div className="text-sm">
          {model.crossings.length === 0 ? (
            <p className="text-muted-foreground">
              No crossings between the selected cards in this category: the same card leads at every spend
              level.
            </p>
          ) : (
            <ul className="list-disc pl-5">
              {model.crossings.map((c, i) => (
                <li key={i}>
                  Crossing at {formatCentsWhole(c.at)}/month: {c.above.name} beats {c.below.name} above it.
                </li>
              ))}
            </ul>
          )}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Show the numbers as a table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Annual net value by monthly {label} spend</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="p-2">
                    Monthly {label}
                  </th>
                  {all.map((c) => (
                    <th key={c.id} scope="col" className="p-2">
                      {c.id === baseline.id ? "Flat 2%" : c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.data
                  .filter((_, i) => i % 6 === 0)
                  .map((row) => (
                    <tr key={row.x} className="border-b">
                      <th scope="row" className="p-2 text-left font-normal">
                        {dollars(row.x ?? 0)}
                      </th>
                      {all.map((c, i) => (
                        <td key={c.id} className="p-2">
                          {dollars(row[`k${i}`] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

type Kind = SensitivityVariable["kind"];

/** Vary one input and see how each card's value moves; winner flips are stated in words. */
export function SensitivityPanel({
  cards,
  baseline,
  spend,
  options,
  currencies,
}: Props & { currencies: Map<string, RewardCurrency> }) {
  const [kind, setKind] = useState<Kind>("cents_per_point");
  const [currencyId, setCurrencyId] = useState("");
  const [category, setCategory] = useState<Category>("dining");
  const [cardId, setCardId] = useState("");

  const pointCurrencies = [
    ...new Set(cards.flatMap((c) => [c.rewardCurrencyId, c.signupBonus?.currencyId ?? ""])),
  ]
    .map((id) => currencies.get(id))
    .filter((c): c is RewardCurrency => !!c && c.kind !== "cash");
  const creditCards = cards.filter((c) => c.credits.length > 0);
  const available: Kind[] = [
    ...(pointCurrencies.length ? (["cents_per_point"] as const) : []),
    "category_spend",
    ...(creditCards.length ? (["credit_utilization"] as const) : []),
  ];
  const effKind = available.includes(kind) ? kind : "category_spend";
  const cur = pointCurrencies.find((c) => c.id === currencyId) ?? pointCurrencies[0];
  const creditCard = creditCards.find((c) => c.id === cardId) ?? creditCards[0];

  const model = useMemo(() => {
    const all = [...cards, baseline];
    let variable: SensitivityVariable | null = null;
    if (effKind === "cents_per_point" && cur)
      variable = { kind: "cents_per_point", currencyId: cur.id, from: 0.5, to: 3, steps: 26 };
    else if (effKind === "category_spend")
      variable = {
        kind: "category_spend",
        category,
        from: 0,
        to: Math.max(200_000, spend[category] * 2),
        steps: 21,
      };
    else if (effKind === "credit_utilization" && creditCard)
      variable = { kind: "credit_utilization", cardId: creditCard.id, from: 0, to: 1, steps: 21 };
    if (!variable) return null;
    const res = sensitivity(all, spend, variable, options);
    const scale =
      variable.kind === "category_spend" ? 1 / 100 : variable.kind === "credit_utilization" ? 100 : 1;
    const data = res.steps.map((s) => {
      const row: Record<string, number> = { x: s.x * scale };
      s.values.forEach((v, i) => (row[`k${i}`] = v.totalCents / 100));
      return row;
    });
    const nameOf = (id: string) =>
      id === baseline.id ? "a flat 2% card" : (all.find((c) => c.id === id)?.name ?? id);
    const fmtAt = (at: number) =>
      variable.kind === "cents_per_point"
        ? `${at.toFixed(2)}c per point`
        : variable.kind === "category_spend"
          ? `${formatCentsWhole(at)}/month`
          : `${Math.round(at * 100)}%`;
    const lead = (at: number) =>
      variable.kind === "cents_per_point"
        ? `If you value ${cur?.name} below ${fmtAt(at)}`
        : variable.kind === "category_spend"
          ? `If you spend less than ${fmtAt(at)} on ${CATEGORY_LABELS[variable.category].toLowerCase()}`
          : `If you use less than ${fmtAt(at)} of ${creditCard?.name}'s credits`;
    const sentences = res.flips.map(
      (f) => `${lead(f.at)}, ${nameOf(f.winnerBelowId)} wins; above that, ${nameOf(f.winnerAboveId)} wins.`,
    );
    const first = res.steps[0]?.winnerId;
    const xs = data.map((d) => d.x ?? 0);
    return {
      data,
      sentences,
      flips: res.flips.map((f) => f.at * scale),
      xMax: Math.max(...xs),
      xMin: Math.min(...xs),
      always: first ? nameOf(first) : null,
      xFormat: (v: number) =>
        variable.kind === "cents_per_point"
          ? `${v.toFixed(1)}c`
          : variable.kind === "category_spend"
            ? dollars(v)
            : `${Math.round(v)}%`,
      xLabel:
        variable.kind === "cents_per_point"
          ? `${cur?.name} cents per point`
          : variable.kind === "category_spend"
            ? `Monthly ${CATEGORY_LABELS[variable.category].toLowerCase()} spend`
            : `Share of ${creditCard?.name} credits used`,
    };
  }, [cards, baseline, spend, options, effKind, cur, category, creditCard]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sensitivity</CardTitle>
        <CardDescription>
          Change one assumption and watch each card&apos;s annual value move. The flat 2% baseline is
          included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sens-kind">Vary</Label>
            <Select id="sens-kind" value={effKind} onChange={(e) => setKind(e.target.value as Kind)}>
              {available.includes("cents_per_point") && (
                <option value="cents_per_point">A currency&apos;s cents per point</option>
              )}
              <option value="category_spend">A category&apos;s monthly spend</option>
              {available.includes("credit_utilization") && (
                <option value="credit_utilization">A card&apos;s credit use</option>
              )}
            </Select>
          </div>
          <div className="space-y-1.5">
            {effKind === "cents_per_point" && (
              <>
                <Label htmlFor="sens-cur">Currency</Label>
                <Select id="sens-cur" value={cur?.id} onChange={(e) => setCurrencyId(e.target.value)}>
                  {pointCurrencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            {effKind === "category_spend" && (
              <>
                <Label htmlFor="sens-cat">Category</Label>
                <Select
                  id="sens-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </>
            )}
            {effKind === "credit_utilization" && (
              <>
                <Label htmlFor="sens-card">Card</Label>
                <Select id="sens-card" value={creditCard?.id} onChange={(e) => setCardId(e.target.value)}>
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>
        </div>
        {model && (
          <>
            <LineView
              data={model.data}
              lines={lineSpecs(cards, baseline)}
              xLabel={model.xLabel}
              xFormat={model.xFormat}
              xMax={model.xMax}
              label={`Line chart of each card's annual value as ${model.xLabel.toLowerCase()} changes. Winner changes are listed below the chart.`}
            >
              {model.flips.map((x, i) => (
                <ReferenceLine
                  key={i}
                  x={x}
                  stroke="var(--foreground)"
                  strokeDasharray="2 3"
                  label={{ value: model.xFormat(x), position: "top", fill: "currentColor", fontSize: 12 }}
                />
              ))}
            </LineView>
            <div className="text-sm" aria-live="polite">
              {model.sentences.length === 0 ? (
                <p className="text-muted-foreground">
                  {model.always
                    ? `${model.always} wins across the whole range.`
                    : "The top cards tie across the range."}
                </p>
              ) : (
                <ul className="list-disc pl-5">
                  {model.sentences.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
