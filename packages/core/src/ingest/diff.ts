export interface DiffResult<T> {
  created: T[];
  updated: { record: T; changedFields: string[] }[];
  unchanged: T[];
}

export interface DiffOptions {
  /** Fields ignored when comparing (e.g. lastVerifiedAt, which changes on every fetch). */
  ignoreFields?: readonly string[];
}

/** JSON with sorted object keys, so equal values compare equal regardless of key order. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

/**
 * Classify incoming records against existing ones by key. Records only in `existing` are ignored:
 * ingestion never deletes.
 */
export function diffRecords<T extends object>(
  existing: readonly T[],
  incoming: readonly T[],
  key: (record: T) => string,
  options: DiffOptions = {},
): DiffResult<T> {
  const ignore = new Set(options.ignoreFields ?? []);
  const byKey = new Map(existing.map((r) => [key(r), r]));
  const result: DiffResult<T> = { created: [], updated: [], unchanged: [] };
  for (const record of incoming) {
    const old = byKey.get(key(record));
    if (!old) {
      result.created.push(record);
      continue;
    }
    const a = old as Record<string, unknown>;
    const b = record as Record<string, unknown>;
    const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changedFields = [...fields]
      .filter((f) => !ignore.has(f) && canonical(a[f]) !== canonical(b[f]))
      .sort();
    if (changedFields.length) result.updated.push({ record, changedFields });
    else result.unchanged.push(record);
  }
  return result;
}

/** Deep equality for plain JSON values (used for "did the rate tiers change"). */
export const jsonEqual = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
