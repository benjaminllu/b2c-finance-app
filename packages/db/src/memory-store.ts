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
import type { DataStore, DepositProductRepo, Repo, RunResult } from "./store";

export interface MemoryRun extends Partial<RunResult> {
  id: string;
  adapterId: string;
  startedAt: Date;
}

/** In-memory DataStore for tests. Records are deep-copied so callers cannot mutate stored state. */
export function createMemoryStore() {
  const copy = <T>(v: T): T => structuredClone(v);
  const repo = <T extends { id: string }>(): Repo<T> & { rows: Map<string, T> } => {
    const rows = new Map<string, T>();
    return {
      rows,
      list: async () => [...rows.values()].map(copy),
      upsert: async (r) => void rows.set(r.id, copy(r)),
    };
  };

  const products = repo<DepositProduct>();
  const history: { productId: string; tiers: ApyTier[]; source: string; recordedAt: Date }[] = [];
  const depositProducts: DepositProductRepo & { rows: typeof products.rows } = {
    ...products,
    latestRateTiers: async (productId) => {
      const rows = history.filter((h) => h.productId === productId);
      const last = rows[rows.length - 1];
      return last ? copy(last.tiers) : null;
    },
    appendRateHistory: async (productId, tiers, source, recordedAt) =>
      void history.push({ productId, tiers: copy(tiers), source, recordedAt }),
    setRates: async (productId, tiers, lastVerifiedAt) => {
      const p = products.rows.get(productId);
      if (!p) throw new Error(`unknown product ${productId}`);
      products.rows.set(productId, { ...p, apyTiers: copy(tiers), lastVerifiedAt });
    },
  };

  const runs: MemoryRun[] = [];
  const store = {
    issuers: repo<Issuer>(),
    currencies: repo<RewardCurrency>(),
    cards: repo<CreditCard>(),
    banks: repo<Bank>(),
    depositProducts,
    offers: repo<BonusOffer>(),
    rules: repo<EligibilityRule>(),
    runs: {
      start: async (adapterId: string, startedAt: Date) => {
        const id = `run-${runs.length + 1}`;
        runs.push({ id, adapterId, startedAt });
        return id;
      },
      finish: async (runId: string, result: RunResult) => {
        const run = runs.find((r) => r.id === runId);
        if (!run) throw new Error(`unknown run ${runId}`);
        Object.assign(run, result);
      },
    },
  } satisfies DataStore;

  return { store: store as DataStore, tables: store, history, runs };
}
