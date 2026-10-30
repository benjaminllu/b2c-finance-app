import { z } from "zod";
import { parseCsv } from "./csv";
import {
  RateUpdateSchema,
  type DataSource,
  type IngestError,
  type NormalizeResult,
  type RateUpdate,
} from "./types";

export type CsvRateRow = Record<string, string>;

const MONEY = /^\d+(\.\d{1,2})?$/;
const PERCENT = /^\d+(\.\d{1,3})?$/;
const dollarsToCents = (s: string) => Math.round(Number(s) * 100);

/**
 * Example adapter: a CSV of APY tiers per deposit product.
 *
 *   product_id,min_balance_usd,max_balance_usd,apy_percent,as_of
 *   marcus-online-savings,0,,4.10,2026-10-30
 *
 * One row per tier; leave max_balance_usd empty for the top tier. `read` supplies the CSV text so this
 * module stays free of file-system access (the registry in @optima/db reads the file).
 */
export function csvRatesSource(opts: {
  id: string;
  read: () => Promise<string>;
}): DataSource<"rates", CsvRateRow> {
  return {
    id: opts.id,
    kind: "rates",
    async fetch() {
      return parseCsv(await opts.read());
    },
    normalize(rows): NormalizeResult<RateUpdate> {
      const errors: IngestError[] = [];
      const groups = new Map<string, { firstIndex: number; asOf: string; tiers: unknown[] }>();

      rows.forEach((row, index) => {
        const id = row.product_id ?? "";
        const {
          min_balance_usd: min = "",
          max_balance_usd: max = "",
          apy_percent: apy = "",
          as_of: asOf = "",
        } = row;
        const problems: string[] = [];
        if (!id) problems.push("product_id is required");
        if (!MONEY.test(min)) problems.push(`min_balance_usd "${min}" is not a dollar amount`);
        if (max !== "" && !MONEY.test(max)) problems.push(`max_balance_usd "${max}" is not a dollar amount`);
        if (!PERCENT.test(apy)) problems.push(`apy_percent "${apy}" is not a percentage`);
        if (!z.iso.date().safeParse(asOf).success) problems.push(`as_of "${asOf}" is not YYYY-MM-DD`);
        if (problems.length) {
          errors.push({ index, message: problems.join("; ") });
          return;
        }
        const g = groups.get(id) ?? { firstIndex: index, asOf, tiers: [] };
        if (g.asOf !== asOf) {
          errors.push({ index, message: `as_of differs between rows of ${id}` });
          return;
        }
        g.tiers.push({
          minBalanceCents: dollarsToCents(min),
          maxBalanceCents: max === "" ? null : dollarsToCents(max),
          apyBps: Math.round(Number(apy) * 100),
        });
        groups.set(id, g);
      });

      const records: RateUpdate[] = [];
      for (const [productId, g] of groups) {
        const tiers = (g.tiers as { minBalanceCents: number }[]).sort(
          (a, b) => a.minBalanceCents - b.minBalanceCents,
        );
        const parsed = RateUpdateSchema.safeParse({
          productId,
          apyTiers: tiers,
          observedAt: `${g.asOf}T00:00:00Z`,
        });
        if (parsed.success) records.push(parsed.data);
        else errors.push({ index: g.firstIndex, message: `${productId}: ${z.prettifyError(parsed.error)}` });
      }
      return { records, errors };
    },
  };
}
