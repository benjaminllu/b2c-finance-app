import Link from "next/link";
import { hasDatabase } from "@optima/db";
import { Alert, Card, CardDescription, CardHeader, CardTitle } from "@optima/ui";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const AREAS = [
  { href: "/admin/offers", title: "Bonus offers", body: "Add, edit, and verify offers." },
  { href: "/admin/banking", title: "Banks and deposit products", body: "Add, edit, and verify rates." },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="Curate the data Optima shows. Every record needs a source URL."
      />
      {!hasDatabase() && (
        <Alert variant="warning">
          No database is configured (DATABASE_URL is unset), so the app is reading seed JSON and admin edits
          are disabled. Start Postgres with <code>pnpm db:up</code>, then run <code>pnpm db:migrate</code> and{" "}
          <code>pnpm db:seed</code>.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {AREAS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full hover:bg-accent/50">
              <CardHeader>
                <CardTitle>{a.title}</CardTitle>
                <CardDescription>{a.body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
