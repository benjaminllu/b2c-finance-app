import { CATEGORIES, type Category, type SpendProfile } from "@optima/core";
import type { ValuationView } from "@optima/core/cards";

/** Everything the user can change on /cards; this is exactly what the URL encodes. */
export interface CardsState {
  cardIds: string[];
  /** Monthly spend in cents per category. */
  spend: SpendProfile;
  /** Cents-per-point overrides by currency id (only entries that differ from the default). */
  centsPerPoint: Record<string, number>;
  /** Share (0-100) of each credit the user will use, by credit id; absent = never. */
  creditPercent: Record<string, number>;
  view: ValuationView;
}

export const MAX_CARDS = 4;
/** A flat 2% card and a travel card, so the page is useful on first load. */
export const DEFAULT_CARD_IDS = ["citi-double-cash", "chase-sapphire-preferred"];

const fromDollars = (d: Record<Category, number>): SpendProfile =>
  Object.fromEntries(CATEGORIES.map((c) => [c, d[c] * 100])) as SpendProfile;

/** Example monthly profiles in dollars. Illustrative, not survey data. */
export const DEFAULT_SPEND = fromDollars({
  groceries: 400,
  dining: 250,
  gas: 120,
  travel: 100,
  airfare: 150,
  hotels: 100,
  transit: 50,
  streaming: 30,
  drugstores: 40,
  online_retail: 150,
  utilities: 150,
  other: 600,
});

export const PRESETS: { id: string; label: string; spend: SpendProfile }[] = [
  {
    id: "student",
    label: "Student",
    spend: fromDollars({
      groceries: 200,
      dining: 150,
      gas: 40,
      travel: 20,
      airfare: 30,
      hotels: 0,
      transit: 40,
      streaming: 25,
      drugstores: 20,
      online_retail: 100,
      utilities: 80,
      other: 250,
    }),
  },
  {
    id: "family",
    label: "Family",
    spend: fromDollars({
      groceries: 900,
      dining: 350,
      gas: 220,
      travel: 60,
      airfare: 150,
      hotels: 100,
      transit: 30,
      streaming: 50,
      drugstores: 100,
      online_retail: 300,
      utilities: 300,
      other: 1200,
    }),
  },
  {
    id: "traveler",
    label: "Frequent traveler",
    spend: fromDollars({
      groceries: 450,
      dining: 600,
      gas: 80,
      travel: 250,
      airfare: 500,
      hotels: 450,
      transit: 150,
      streaming: 40,
      drugstores: 40,
      online_retail: 200,
      utilities: 150,
      other: 600,
    }),
  },
];

export function defaultState(): CardsState {
  return {
    cardIds: [...DEFAULT_CARD_IDS],
    spend: { ...DEFAULT_SPEND },
    centsPerPoint: {},
    creditPercent: {},
    view: "ongoing",
  };
}

const pairs = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}:${v}`);

/**
 * Compact query string (no leading "?"), omitting defaults:
 * c=card,card  s=category:dollars (only changed categories)  v=currency:centsPerPoint
 * u=creditId:percentUsed (never-used omitted)  view=first
 */
export function encodeState(s: CardsState): string {
  const parts: string[] = [];
  if (s.cardIds.join(",") !== DEFAULT_CARD_IDS.join(",")) parts.push(`c=${s.cardIds.join(",")}`);
  const spend = CATEGORIES.filter((c) => s.spend[c] !== DEFAULT_SPEND[c]).map(
    (c) => `${c}:${s.spend[c] / 100}`,
  );
  if (spend.length) parts.push(`s=${spend.join(",")}`);
  const v = pairs(s.centsPerPoint);
  if (v.length) parts.push(`v=${v.join(",")}`);
  const u = pairs(Object.fromEntries(Object.entries(s.creditPercent).filter(([, p]) => p > 0)));
  if (u.length) parts.push(`u=${u.join(",")}`);
  if (s.view === "first_year") parts.push("view=first");
  return parts.join("&");
}

function parsePairs(raw: string | null): [string, number][] {
  if (!raw) return [];
  return raw.split(",").flatMap((p) => {
    const i = p.lastIndexOf(":");
    const n = Number(p.slice(i + 1));
    return i > 0 && p.slice(i + 1) !== "" && Number.isFinite(n)
      ? [[p.slice(0, i), n] as [string, number]]
      : [];
  });
}

/** Inverse of encodeState; bad or unknown values fall back to defaults instead of throwing. */
export function decodeState(
  params: { get(name: string): string | null },
  knownCardIds?: ReadonlySet<string>,
): CardsState {
  const state = defaultState();
  const c = params.get("c");
  if (c !== null) {
    const ids = c.split(",").filter((id) => id && (!knownCardIds || knownCardIds.has(id)));
    state.cardIds = [...new Set(ids)].slice(0, MAX_CARDS);
  }
  for (const [cat, dollars] of parsePairs(params.get("s"))) {
    if ((CATEGORIES as readonly string[]).includes(cat) && dollars >= 0 && dollars <= 1_000_000)
      state.spend[cat as Category] = Math.round(dollars * 100);
  }
  for (const [id, cpp] of parsePairs(params.get("v"))) {
    if (cpp > 0 && cpp <= 100) state.centsPerPoint[id] = cpp;
  }
  for (const [id, pct] of parsePairs(params.get("u"))) {
    const p = Math.round(pct);
    if (p > 0) state.creditPercent[id] = Math.min(100, p);
  }
  if (params.get("view") === "first") state.view = "first_year";
  return state;
}
