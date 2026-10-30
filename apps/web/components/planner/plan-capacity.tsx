"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthName, type Plan } from "@optima/core/planner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@optima/ui";
import { formatCentsWhole } from "@/lib/format";

const pct = (used: number, cap: number) => (cap > 0 ? ` (${Math.round((used / cap) * 100)}%)` : "");

/** Running total chart plus the per-month capacity table, which doubles as the chart's text alternative. */
export function PlanCapacity({ plan }: { plan: Plan }) {
  const c = plan.capacity;
  const data = plan.months.map((m) => ({
    label: monthName(m.label),
    posted: m.postedNetCents / 100,
    total: m.cumulativeNetCents / 100,
  }));
  const dollars = (v: unknown) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expected value over time</CardTitle>
        <CardDescription>
          {formatCentsWhole(plan.totalNetCents)} total, counted in the month each bonus is expected to post.
          Exact numbers are in the table below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="h-64 w-full"
          role="img"
          aria-label="Chart of bonus value posting each month and the running total. The table below has the same numbers."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--chart-baseline)" strokeOpacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fill: "currentColor", fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis width={72} tick={{ fill: "currentColor", fontSize: 12 }} tickFormatter={dollars} />
              <Tooltip formatter={dollars} />
              <Legend />
              <Bar
                dataKey="posted"
                name="Posted this month"
                fill="var(--chart-2)"
                isAnimationActive={false}
              />
              <Line
                dataKey="total"
                name="Running total"
                type="stepAfter"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="mb-2 text-left text-muted-foreground">
              Capacity used each month. Limits: {formatCentsWhole(c.spendCents)} spend,{" "}
              {formatCentsWhole(c.ddCents)} direct deposit across {c.ddSplits} account
              {c.ddSplits === 1 ? "" : "s"}, {formatCentsWhole(c.parkedCents)} parked cash, {c.pullsPer6} hard
              pulls per 6 months and {c.pullsPer12} per 12.
            </caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Month
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Applications
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Spend
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Direct deposit
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Parked cash
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Hard pulls, last 6 / 12 mo
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Posted
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Running total
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.months.map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap">
                    {monthName(m.label)}
                    {!m.inHorizon && <span className="block text-xs text-muted-foreground">after plan</span>}
                  </th>
                  <td className="py-1 pr-3">
                    {m.applications.length
                      ? m.applications
                          .map((id) => plan.steps.find((s) => s.offerId === id)?.title ?? id)
                          .join("; ")
                      : "-"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {formatCentsWhole(m.spendCents)}
                    {pct(m.spendCents, c.spendCents)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {formatCentsWhole(m.ddCents)}
                    {pct(m.ddCents, c.ddCents)}
                    <span className="block text-xs text-muted-foreground">
                      {m.ddSplits} of {c.ddSplits} splits
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {formatCentsWhole(m.parkedCents)}
                    {pct(m.parkedCents, c.parkedCents)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {m.pullsLast6} / {m.pullsLast12}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {m.postedNetCents ? formatCentsWhole(m.postedNetCents) : "-"}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatCentsWhole(m.cumulativeNetCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
