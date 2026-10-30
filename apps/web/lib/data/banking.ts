import type { Bank, DepositProduct } from "@optima/core";
import { bankFromRow, depositProductFromRow, getPrisma, hasDatabase } from "@optima/db";
import { seed } from "@optima/seed";

// Server-only. Reads Postgres when DATABASE_URL is set, otherwise the validated seed JSON.

export async function getBanks(): Promise<Bank[]> {
  if (!hasDatabase()) return seed.banks;
  return (await getPrisma().bank.findMany({ orderBy: { name: "asc" } })).map(bankFromRow);
}

export async function getDepositProducts(): Promise<DepositProduct[]> {
  if (!hasDatabase()) return seed.depositProducts;
  return (await getPrisma().depositProduct.findMany({ orderBy: { name: "asc" } })).map(depositProductFromRow);
}
