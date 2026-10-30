"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@optima/ui";
import { DAYS_PER_MONTH, projectGrowth, type RankedOption } from "@optima/core/banking";
import { formatCentsWhole } from "@/lib/format";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/** Balance over time for the top deposit accounts. The table below is the text alternative. */
export function ProjectionChart({
  options,
  names,
  amountCents,
  months,
}: {
  options: RankedOption[];
  names: Map<string, string>;
  amountCents: number;
  months: number;
}) {
  const series = options
    .filter((o) => o.product)
    .slice(0, 4)
    .map((o, i) => ({
      key: `s${i}`,
      name: names.get(o.id) ?? o.id,
      color: COLORS[i] ?? "var(--chart-baseline)",
      points: projectGrowth(o.product!, { principalCents: amountCents, horizonDays: months * DAYS_PER_MONTH })
        .points,
    }));
  const data = Array.from({ length: months + 1 }, (_, m) => {
    const row: Record<string, number> = { month: m };
    for (const s of series) row[s.key] = (s.points[m]?.balanceCents ?? 0) / 100;
    return row;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projected balance</CardTitle>
        <CardDescription>
          Top accounts for {formatCentsWhole(amountCents)} over {months} months, net of monthly fees. Rates
          are assumed to stay the same.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts to chart for these inputs.</p>
        ) : (
          <>
            <div
              className="h-72 w-full"
              role="img"
              aria-label={`Line chart of projected balances. Exact numbers are in the table below.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--chart-baseline)" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "currentColor", fontSize: 12 }}
                    label={{
                      value: "Months",
                      position: "insideBottom",
                      offset: -2,
                      fill: "currentColor",
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    width={72}
                    tick={{ fill: "currentColor", fontSize: 12 }}
                    tickFormatter={(v: number) => `$${Math.round(v).toLocaleString("en-US")}`}
                  />
                  <Tooltip
                    formatter={(v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    labelFormatter={(m) => `Month ${m}`}
                  />
                  <Legend />
                  {series.map((s) => (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-sm">
              <caption className="mb-1 text-left text-muted-foreground">
                Ending balance after {months} months
              </caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Account
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Ending balance
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Interest minus fees
                  </th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const end = s.points[s.points.length - 1];
                  return (
                    <tr key={s.key} className="border-b last:border-0">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">
                        <span
                          aria-hidden
                          className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: s.color }}
                        />
                        {s.name}
                      </th>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {formatCentsWhole(end?.balanceCents ?? 0)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatCentsWhole((end?.balanceCents ?? 0) - amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
