import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PlannerExplorer } from "@/components/planner/planner-explorer";
import { getBanks, getDepositProducts } from "@/lib/data/banking";
import { getCards, getCurrencies, getIssuers } from "@/lib/data/cards";
import { getOffers } from "@/lib/data/offers";
import { getRules } from "@/lib/data/rules";

export const metadata = { title: "Churn planner" };
// Offer expiry and the plan's start date depend on today's date.
export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const [offers, rules, cards, currencies, issuers, banks, depositProducts] = await Promise.all([
    getOffers(),
    getRules(),
    getCards(),
    getCurrencies(),
    getIssuers(),
    getBanks(),
    getDepositProducts(),
  ]);
  const institutions = [...issuers, ...banks]
    .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const products = [
    ...cards.map((c) => ({
      id: c.id,
      name: c.name,
      institutionId: c.issuerId,
      productType: "credit_card" as const,
      productFamily: c.productFamily,
    })),
    // CDs are not a ProductType in account history, so they are left out.
    ...depositProducts.flatMap((p) =>
      p.type === "cd"
        ? []
        : [{ id: p.id, name: p.name, institutionId: p.bankId, productType: p.type, productFamily: null }],
    ),
  ];

  return (
    <div>
      <PageHeader
        title="Churn planner"
        description="A 12 to 24 month plan for which cards and bank accounts to open and when, with the expected value of each step."
      />
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <PlannerExplorer
          offers={offers}
          rules={rules}
          cards={cards}
          currencies={currencies}
          institutions={institutions}
          products={products}
          nowIso={new Date().toISOString()}
        />
      </Suspense>
    </div>
  );
}
