import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@optima/ui";

// The layout's sample-data banner reads live data, so do not prerender at build time.
export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/cards",
    title: "Compare cards",
    body: "Put 2 to 4 cards side by side and see the break-even points.",
  },
  { href: "/offers", title: "Bonus offers", body: "Current card and checking bonuses, valued net of fees." },
  {
    href: "/banking",
    title: "Where should my cash go?",
    body: "HYSAs, CDs, and bank bonuses on one effective-APY scale.",
  },
  {
    href: "/planner",
    title: "Churn planner",
    body: "A month-by-month plan that respects issuer rules and your capacity.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Decisions that show their math.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Optima compares credit cards, bank bonuses, and deposit accounts, and always explains why one option
          wins.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
