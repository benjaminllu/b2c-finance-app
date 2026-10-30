"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** String-valued view state mirrored into the URL query (omitting defaults) so the view is shareable. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const params = useSearchParams();
  const [state, setState] = useState<T>(
    () => Object.fromEntries(Object.keys(defaults).map((k) => [k, params.get(k) ?? defaults[k]])) as T,
  );

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    for (const k of Object.keys(defaults)) {
      if (state[k] === defaults[k]) q.delete(k);
      else q.set(k, state[k] as string);
    }
    const qs = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [state, defaults]);

  const update = useCallback((patch: Partial<T>) => setState((prev) => ({ ...prev, ...patch })), []);
  return [state, update] as const;
}

/** "12,500" or "12500.50" -> cents; invalid -> 0. */
export function dollarsToCents(s: string): number {
  const n = Number.parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export function clampInt(s: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
