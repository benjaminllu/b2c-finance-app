import { csvRatesSource, type AnyDataSource, type RateUpdate } from "@optima/core/ingest";
import { seed } from "@optima/seed";
import { describe, expect, it } from "vitest";
import { runIngest } from "./ingest-runner";
import { createMemoryStore } from "./memory-store";
import { runSeed } from "./seed-logic";

const snapshot = (m: ReturnType<typeof createMemoryStore>) =>
  JSON.stringify({
    tables: Object.fromEntries(
      Object.entries(m.tables)
        .filter(([k]) => k !== "runs")
        .map(([k, t]) => [k, [...(t as { rows: Map<string, unknown> }).rows]]),
    ),
    history: m.history,
  });

describe("runSeed", () => {
  it("loads every record and is idempotent", async () => {
    const m = createMemoryStore();
    const first = await runSeed(m.store, seed, new Date("2026-10-30T00:00:00Z"));
    expect(first.counts.cards).toBe(seed.cards.length);
    expect(m.tables.cards.rows.size).toBe(seed.cards.length);
    expect(first.rateHistoryAppended).toBe(seed.depositProducts.length);
    const before = snapshot(m);

    const second = await runSeed(m.store, seed, new Date("2026-10-31T00:00:00Z"));
    expect(second.rateHistoryAppended).toBe(0);
    expect(snapshot(m)).toBe(before);
  });

  it("appends history when a seed rate changes", async () => {
    const m = createMemoryStore();
    await runSeed(m.store, seed);
    const [p, ...rest] = seed.depositProducts;
    const bumped = { ...p!, apyTiers: p!.apyTiers.map((t) => ({ ...t, apyBps: t.apyBps + 5 })) };
    const report = await runSeed(m.store, { ...seed, depositProducts: [bumped, ...rest] });
    expect(report.rateHistoryAppended).toBe(1);
    expect(m.history.filter((h) => h.productId === p!.id)).toHaveLength(2);
  });
});

describe("runIngest (rates)", () => {
  const csv = (rows: string[]) =>
    csvRatesSource({
      id: "test-csv",
      read: async () => ["product_id,min_balance_usd,max_balance_usd,apy_percent,as_of", ...rows].join("\n"),
    });
  const target = seed.depositProducts.find((p) => p.id === "marcus-online-savings")!;

  it("applies a rate change, appends history, records the run, and is a no-op the second time", async () => {
    const m = createMemoryStore();
    await runSeed(m.store, seed);
    const histBefore = m.history.length;
    const src = csv(["marcus-online-savings,0,,3.00,2026-10-31", "no-such-product,0,,1.00,2026-10-31"]);

    const a = await runIngest(m.store, src, new Date("2026-11-01T00:00:00Z"));
    expect(a).toMatchObject({ status: "succeeded", created: 0, updated: 1, unchanged: 0 });
    expect(a.errors[0]?.message).toMatch(/unknown deposit product/);
    expect(m.tables.depositProducts.rows.get(target.id)).toMatchObject({
      apyTiers: [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 300 }],
      lastVerifiedAt: "2026-10-31T00:00:00Z",
    });
    expect(m.history).toHaveLength(histBefore + 1);
    expect(m.history.at(-1)).toMatchObject({ productId: target.id, source: "test-csv" });
    expect(m.runs[0]).toMatchObject({ adapterId: "test-csv", status: "succeeded", updated: 1 });

    const b = await runIngest(m.store, src);
    expect(b).toMatchObject({ updated: 0, unchanged: 1 });
    expect(m.history).toHaveLength(histBefore + 1);
  });

  it("fails the run when every record is invalid, or when fetch throws", async () => {
    const m = createMemoryStore();
    await runSeed(m.store, seed);
    const bad = await runIngest(m.store, csv(["marcus-online-savings,0,,oops,2026-10-31"]));
    expect(bad.status).toBe("failed");
    const boom: AnyDataSource = {
      id: "boom",
      kind: "rates",
      fetch: async () => {
        throw new Error("network down");
      },
      normalize: () => ({ records: [] as RateUpdate[], errors: [] }),
    };
    const r = await runIngest(m.store, boom);
    expect(r.status).toBe("failed");
    expect(m.runs.at(-1)).toMatchObject({ status: "failed", error: "network down" });
  });
});

describe("runIngest (offers)", () => {
  it("creates, updates and leaves unchanged records via the generic path", async () => {
    const m = createMemoryStore();
    await runSeed(m.store, seed);
    const [o1, o2] = seed.offers;
    const incoming = [{ ...o1!, bonusValue: o1!.bonusValue + 100 }, o2!, { ...o2!, id: "brand-new-offer" }];
    const src: AnyDataSource = {
      id: "offers-test",
      kind: "offers",
      fetch: async () => [1],
      normalize: () => ({ records: incoming, errors: [] }),
    };
    const s = await runIngest(m.store, src);
    expect(s).toMatchObject({ created: 1, updated: 1, unchanged: 1 });
    expect(s.log.join("\n")).toContain("updated " + o1!.id + " (bonusValue)");
  });
});
