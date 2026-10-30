import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { OffersExplorer } from "@/components/offers/offers-explorer";
import { getDepositProducts, getBanks } from "@/lib/data/banking";
import { getCards, getCurrencies, getIssuers } from "@/lib/data/cards";
import { getOffers } from "@/lib/data/offers";
import { getRules } from "@/lib/data/rules";

export const metadata = { title: "Bonus offers" };
// Expiry and staleness depend on today's date.
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const [offers, cards, issuers, banks, products, currencies, rules] = await Promise.all([
    getOffers(),
    getCards(),
    getIssuers(),
    getBanks(),
    getDepositProducts(),
    getCurrencies(),
    getRules(),
  ]);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  // Expired offers never reach the client.
  const live = offers.filter((o) => !o.expiresAt || o.expiresAt >= today);
  return (
    <div>
      <PageHeader
        title="Bonus offers"
        description="Current credit card and checking sign-up bonuses with requirements, deadlines, and net value after fees."
      />
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <OffersExplorer
          offers={live}
          cards={cards}
          issuers={issuers}
          banks={banks}
          products={products}
          currencies={currencies}
          rules={rules}
          nowIso={nowIso}
        />
      </Suspense>
    </div>
  );
}
