import {
  diffRecords,
  type AnyDataSource,
  type DiffResult,
  type IngestError,
  type RateUpdate,
} from "@optima/core/ingest";
import { upsertDepositProduct } from "./seed-logic";
import type { DataStore, Repo } from "./store";

export interface IngestSummary {
  adapterId: string;
  runId: string;
  status: "succeeded" | "failed";
  created: number;
  updated: number;
  unchanged: number;
  /** Per-record problems (normalization failures, unknown products). */
  errors: IngestError[];
  log: string[];
}

type Counts = Pick<IngestSummary, "created" | "updated" | "unchanged">;

const MAX_LOG = 200;

async function applyDiff<T extends { id: string }>(
  diff: DiffResult<T>,
  write: (record: T) => Promise<unknown>,
  log: string[],
): Promise<Counts> {
  for (const r of diff.created) {
    await write(r);
    log.push(`created ${r.id}`);
  }
  for (const u of diff.updated) {
    await write(u.record);
    log.push(`updated ${u.record.id} (${u.changedFields.join(", ")})`);
  }
  return { created: diff.created.length, updated: diff.updated.length, unchanged: diff.unchanged.length };
}

async function applyRepo<T extends { id: string }>(
  repo: Repo<T>,
  incoming: T[],
  log: string[],
  write?: (r: T) => Promise<unknown>,
) {
  // lastVerifiedAt moves on every fetch, so it never counts as a change by itself.
  const diff = diffRecords(await repo.list(), incoming, (r) => r.id, { ignoreFields: ["lastVerifiedAt"] });
  return applyDiff(diff, write ?? ((r) => repo.upsert(r)), log);
}

async function applyRates(
  store: DataStore,
  incoming: RateUpdate[],
  adapterId: string,
  now: Date,
  errors: IngestError[],
  log: string[],
): Promise<Counts> {
  const products = await store.depositProducts.list();
  const existing: RateUpdate[] = products.map((p) => ({
    productId: p.id,
    apyTiers: p.apyTiers,
    observedAt: p.lastVerifiedAt,
  }));
  const diff = diffRecords(existing, incoming, (r) => r.productId, { ignoreFields: ["observedAt"] });
  // Rate feeds update existing products; they never create them.
  for (const r of diff.created) {
    errors.push({ index: -1, message: `unknown deposit product "${r.productId}"; rate ignored` });
  }
  for (const { record, changedFields } of diff.updated) {
    await store.depositProducts.setRates(record.productId, record.apyTiers, record.observedAt);
    await store.depositProducts.appendRateHistory(record.productId, record.apyTiers, adapterId, now);
    log.push(`rate changed ${record.productId} (${changedFields.join(", ")})`);
  }
  return { created: 0, updated: diff.updated.length, unchanged: diff.unchanged.length };
}

/**
 * Run one adapter: fetch, normalize, diff against the store, write changes, record an IngestRun.
 * Never throws for adapter or storage failures; they come back as status "failed".
 */
export async function runIngest(
  store: DataStore,
  source: AnyDataSource,
  now: Date = new Date(),
): Promise<IngestSummary> {
  const runId = await store.runs.start(source.id, now);
  const log: string[] = [];
  const errors: IngestError[] = [];
  let counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  let status: IngestSummary["status"] = "succeeded";
  let fatal: string | null = null;

  try {
    const raw = await source.fetch();
    log.push(`fetched ${raw.length} raw records`);
    // Each case narrows `source` so records have the right domain type.
    switch (source.kind) {
      case "cards": {
        const n = source.normalize(raw);
        errors.push(...n.errors);
        counts = await applyRepo(store.cards, n.records, log);
        break;
      }
      case "offers": {
        const n = source.normalize(raw);
        errors.push(...n.errors);
        counts = await applyRepo(store.offers, n.records, log);
        break;
      }
      case "deposit_products": {
        const n = source.normalize(raw);
        errors.push(...n.errors);
        counts = await applyRepo(store.depositProducts, n.records, log, (p) =>
          upsertDepositProduct(store, p, source.id, now),
        );
        break;
      }
      case "rates": {
        const n = source.normalize(raw);
        errors.push(...n.errors);
        counts = await applyRates(store, n.records, source.id, now, errors, log);
        break;
      }
    }
    log.push(
      `${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${errors.length} errors`,
    );
    // Every record bad means the feed itself is broken, not just a few rows.
    if (errors.length > 0 && counts.created + counts.updated + counts.unchanged === 0) {
      status = "failed";
      fatal = "no valid records";
    }
  } catch (e) {
    status = "failed";
    fatal = e instanceof Error ? e.message : String(e);
    log.push(`error: ${fatal}`);
  }

  const detail = errors
    .slice(0, 20)
    .map((e) => `#${e.index}: ${e.message}`)
    .join("\n");
  const error = [fatal, detail].filter(Boolean).join("\n") || null;
  await store.runs.finish(runId, {
    status,
    ...counts,
    error,
    log: { lines: log.slice(0, MAX_LOG), errors: errors.slice(0, MAX_LOG) },
    finishedAt: new Date(),
  });
  return { adapterId: source.id, runId, status, ...counts, errors, log };
}
