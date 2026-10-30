import { jsonEqual } from "@optima/core/ingest";
import type { DepositProduct } from "@optima/core";
import type { Seed } from "@optima/seed";
import type { DataStore } from "./store";

/**
 * Upsert a deposit product and append a RateHistory row only if its current tiers differ from the
 * latest history row. Returns true when a row was appended.
 */
export async function upsertDepositProduct(
  store: DataStore,
  product: DepositProduct,
  source: string,
  at: Date,
): Promise<boolean> {
  await store.depositProducts.upsert(product);
  const latest = await store.depositProducts.latestRateTiers(product.id);
  if (latest && jsonEqual(latest, product.apyTiers)) return false;
  await store.depositProducts.appendRateHistory(product.id, product.apyTiers, source, at);
  return true;
}

export interface SeedReport {
  counts: Record<keyof Seed, number>;
  rateHistoryAppended: number;
}

/** Idempotent: upserts every seed record, parents before children. Running it twice changes nothing. */
export async function runSeed(store: DataStore, seed: Seed, now: Date = new Date()): Promise<SeedReport> {
  for (const r of seed.issuers) await store.issuers.upsert(r);
  for (const r of seed.currencies) await store.currencies.upsert(r);
  for (const r of seed.cards) await store.cards.upsert(r);
  for (const r of seed.banks) await store.banks.upsert(r);
  let rateHistoryAppended = 0;
  for (const r of seed.depositProducts) {
    if (await upsertDepositProduct(store, r, "seed", now)) rateHistoryAppended++;
  }
  for (const r of seed.offers) await store.offers.upsert(r);
  for (const r of seed.rules) await store.rules.upsert(r);
  return {
    counts: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.length])) as SeedReport["counts"],
    rateHistoryAppended,
  };
}
