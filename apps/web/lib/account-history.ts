"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import { AccountRecordSchema, type AccountRecord } from "@optima/core";

// The user's account history lives only in this browser (localStorage), shared by /offers and /planner.
const KEY = "optima:accounts:v1";
const EVENT = "optima:accounts-changed";
const EMPTY: AccountRecord[] = [];

let cachedRaw: string | null = null;
let cached: AccountRecord[] = EMPTY;

function read(): AccountRecord[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  const parsed = z.array(AccountRecordSchema).safeParse(raw ? JSON.parse(raw) : []);
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

export function saveAccountHistory(accounts: AccountRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(accounts));
  } catch {
    // Storage blocked (private mode): the edit still applies for this render via the event below.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Account history from localStorage, empty on the server. */
export function useAccountHistory(): [AccountRecord[], (next: AccountRecord[]) => void] {
  const accounts = useSyncExternalStore(subscribe, read, () => EMPTY);
  const set = useCallback((next: AccountRecord[]) => saveAccountHistory(next), []);
  return [accounts, set];
}
