import { Suspense } from "react";
import { Alert } from "@optima/ui";
import { hasDatabase } from "@optima/db";
import { PageHeader } from "@/components/page-header";
import { BankingExplorer } from "@/components/banking/banking-explorer";
import { getBanks, getDepositProducts } from "@/lib/data/banking";
import { getOffers } from "@/lib/data/offers";

export const metadata = { title: "Banking" };
// Staleness and offer expiry depend on today's date.
export const dynamic = "force-dynamic";

export default async function BankingPage() {
  const [banks, products, offers] = await Promise.all([getBanks(), getDepositProducts(), getOffers()]);
  // Deposit offers only; card offers are not cash options.
  const depositOffers = offers.filter((o) => o.productType !== "credit_card");
  return (
    <div>
      <PageHeader
        title="Banking"
        description="Compare checking, savings, money market accounts, CDs, and bank bonuses on one effective-APY scale."
      />
      {!hasDatabase() && (
        <Alert variant="warning" className="mb-6">
          Showing sample seed data. Rates are examples, not live quotes.
        </Alert>
      )}
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <BankingExplorer
          banks={banks}
          products={products}
          offers={depositOffers}
          nowIso={new Date().toISOString()}
        />
      </Suspense>
    </div>
  );
}
