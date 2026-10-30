import type { BonusOffer } from "@optima/core";
import { getPrisma, hasDatabase, offerFromRow } from "@optima/db";
import { seed } from "@optima/seed";

// Server-only. Reads Postgres when DATABASE_URL is set, otherwise the validated seed JSON.

export async function getOffers(): Promise<BonusOffer[]> {
  if (!hasDatabase()) return seed.offers;
  return (await getPrisma().bonusOffer.findMany({ orderBy: { createdAt: "desc" } })).map(offerFromRow);
}
