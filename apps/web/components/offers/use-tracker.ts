"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import type { TrackerEntry } from "@optima/core/offers";

// Personal offer tracker. Lives only in this browser (no sign-in in v1).
const KEY = "optima:tracker:v1";
const EVENT = "optima:tracker-changed";
const EMPTY: TrackerEntry[] = [];

const EntrySchema = z.object({
  offerId: z.string().min(1),
  appliedAt: z.iso.date(),
  spentCents: z.number().int().nonnegative(),
  directDepositCents: z.number().int().nonnegative(),
});

let cachedRaw: string | null = null;
let cached: TrackerEntry[] = EMPTY;

function read(): TrackerEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  let json: unknown = [];
  try {
    json = raw ? JSON.parse(raw) : [];
  } catch {
    // Corrupt JSON is treated as empty.
  }
  const parsed = z.array(EntrySchema).safeParse(json);
  cached = parsed.success ? parsed.data : EMPTY;
  return cached;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function save(next: TrackerEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change is lost on reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTracker() {
  const entries = useSyncExternalStore(subscribe, read, () => EMPTY);
  /** Insert or replace the entry for offerId; null removes it. */
  const put = useCallback((offerId: string, entry: TrackerEntry | null) => {
    save([...read().filter((e) => e.offerId !== offerId), ...(entry ? [entry] : [])]);
  }, []);
  return [entries, put] as const;
}
