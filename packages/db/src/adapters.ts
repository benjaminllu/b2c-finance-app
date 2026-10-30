import { readFile } from "node:fs/promises";
import path from "node:path";
import { csvRatesSource, type AnyDataSource } from "@optima/core/ingest";

/**
 * Every adapter the codebase knows about. Having one here does NOT run it: the cron route only runs
 * adapters named in INGEST_ADAPTERS (comma-separated ids), so nothing automated is enabled until someone
 * has worked through docs/data-sources.md.
 */
const sampleRatesPath = () =>
  process.env.INGEST_SAMPLE_RATES_PATH ?? path.resolve(process.cwd(), "../../data/ingest/sample-rates.csv");

export const ALL_ADAPTERS: readonly AnyDataSource[] = [
  csvRatesSource({ id: "sample-rates-csv", read: () => readFile(sampleRatesPath(), "utf8") }),
];

export function getEnabledAdapters(env: Record<string, string | undefined> = process.env): AnyDataSource[] {
  const wanted = (env.INGEST_ADAPTERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ALL_ADAPTERS.filter((a) => wanted.includes(a.id));
}
