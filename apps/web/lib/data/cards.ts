import type { CreditCard, Issuer, RewardCurrency } from "@optima/core";
import { cardFromRow, currencyFromRow, getPrisma, hasDatabase, issuerFromRow } from "@optima/db";
import { seed } from "@optima/seed";

// Server-only. Reads Postgres when DATABASE_URL is set, otherwise the validated seed JSON.

export async function getCards(): Promise<CreditCard[]> {
  if (!hasDatabase()) return seed.cards;
  const rows = await getPrisma().creditCard.findMany({ orderBy: { name: "asc" } });
  return rows.map(cardFromRow);
}

export async function getIssuers(): Promise<Issuer[]> {
  if (!hasDatabase()) return seed.issuers;
  return (await getPrisma().issuer.findMany({ orderBy: { name: "asc" } })).map(issuerFromRow);
}

export async function getCurrencies(): Promise<RewardCurrency[]> {
  if (!hasDatabase()) return seed.currencies;
  return (await getPrisma().rewardCurrency.findMany()).map(currencyFromRow);
}
