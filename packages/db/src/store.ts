import type {
  ApyTier,
  Bank,
  BonusOffer,
  CreditCard,
  DepositProduct,
  EligibilityRule,
  Issuer,
  RewardCurrency,
} from "@optima/core";

/**
 * Storage seam for seeding and ingestion. Postgres implements it (prisma-store.ts); tests use an
 * in-memory fake (memory-store.ts). Everything speaks domain types, never rows.
 */
export interface Repo<T> {
  list(): Promise<T[]>;
  /** Insert or replace by id. */
  upsert(record: T): Promise<void>;
}

export interface DepositProductRepo extends Repo<DepositProduct> {
  /** Tiers of the newest RateHistory row, or null if the product has no history. */
  latestRateTiers(productId: string): Promise<ApyTier[] | null>;
  appendRateHistory(productId: string, tiers: ApyTier[], source: string, recordedAt: Date): Promise<void>;
  /** Set the current tiers and lastVerifiedAt of an existing product. */
  setRates(productId: string, tiers: ApyTier[], lastVerifiedAt: string): Promise<void>;
}

export interface RunResult {
  status: "succeeded" | "failed";
  created: number;
  updated: number;
  unchanged: number;
  error: string | null;
  log: unknown;
  finishedAt: Date;
}

export interface RunRepo {
  start(adapterId: string, startedAt: Date): Promise<string>;
  finish(runId: string, result: RunResult): Promise<void>;
}

export interface DataStore {
  issuers: Repo<Issuer>;
  currencies: Repo<RewardCurrency>;
  cards: Repo<CreditCard>;
  banks: Repo<Bank>;
  depositProducts: DepositProductRepo;
  offers: Repo<BonusOffer>;
  rules: Repo<EligibilityRule>;
  runs: RunRepo;
}
