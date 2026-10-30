import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsExplorer } from "@/components/cards/cards-explorer";
import { getCards, getCurrencies, getIssuers } from "@/lib/data/cards";

export const metadata = { title: "Compare cards" };
// Staleness depends on today's date.
export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const [cards, issuers, currencies] = await Promise.all([getCards(), getIssuers(), getCurrencies()]);
  return (
    <div>
      <PageHeader
        title="Compare credit cards"
        description="Pick 2 to 4 cards, enter your spending, and see which one earns you the most after fees, with the math shown."
      />
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <CardsExplorer
          cards={cards}
          issuers={issuers}
          currencies={currencies}
          nowIso={new Date().toISOString()}
        />
      </Suspense>
    </div>
  );
}
