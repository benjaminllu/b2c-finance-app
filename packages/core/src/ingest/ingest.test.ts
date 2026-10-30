import { describe, expect, it } from "vitest";
import { csvRatesSource, diffRecords, parseCsv } from "./index";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF and comments", () => {
    const rows = parseCsv('# comment\r\na,b\r\n"x, y","say ""hi"""\r\n\r\n"line\nbreak",2\r\n');
    expect(rows).toEqual([
      { a: "x, y", b: 'say "hi"' },
      { a: "line\nbreak", b: "2" },
    ]);
  });
  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/Unterminated/);
  });
});

describe("diffRecords", () => {
  const key = (r: { id: string }) => r.id;
  it("classifies created / updated / unchanged and ignores key order and ignored fields", () => {
    const existing = [
      { id: "a", n: 1, nested: { x: 1, y: 2 }, at: "t1" },
      { id: "b", n: 2, nested: { x: 1, y: 2 }, at: "t1" },
      { id: "gone", n: 0, nested: {}, at: "t1" },
    ];
    const incoming = [
      { id: "a", n: 1, nested: { y: 2, x: 1 }, at: "t2" },
      { id: "b", n: 3, nested: { x: 1, y: 2 }, at: "t2" },
      { id: "c", n: 4, nested: {}, at: "t2" },
    ];
    const d = diffRecords(existing, incoming, key, { ignoreFields: ["at"] });
    expect(d.created.map(key)).toEqual(["c"]);
    expect(d.unchanged.map(key)).toEqual(["a"]);
    expect(d.updated.map((u) => [u.record.id, u.changedFields])).toEqual([["b", ["n"]]]);
  });
});

describe("csvRatesSource", () => {
  const csv = [
    "product_id,min_balance_usd,max_balance_usd,apy_percent,as_of",
    "p1,10000,,4.10,2026-10-30",
    "p1,0,9999.99,3.50,2026-10-30",
    "p2,0,,abc,2026-10-30",
    "p3,0,,4,2026-13-45",
  ].join("\n");
  it("groups tiers per product, converts units, and reports bad rows without throwing", async () => {
    const src = csvRatesSource({ id: "t", read: async () => csv });
    const { records, errors } = src.normalize(await src.fetch());
    expect(records).toEqual([
      {
        productId: "p1",
        observedAt: "2026-10-30T00:00:00Z",
        apyTiers: [
          { minBalanceCents: 0, maxBalanceCents: 999999, apyBps: 350 },
          { minBalanceCents: 1000000, maxBalanceCents: null, apyBps: 410 },
        ],
      },
    ]);
    expect(errors.map((e) => e.index)).toEqual([2, 3]);
  });
});
