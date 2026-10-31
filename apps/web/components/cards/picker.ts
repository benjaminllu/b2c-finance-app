import type { CreditCard, RewardCurrency, SpendProfile } from "@optima/core";
import { annualValue, centsPerPointFor, type ValuationOptions } from "@optima/core/cards";

/** Per-card numbers the picker filters and sorts on, valued with the user's point valuations. */
export interface PickerRow {
  card: CreditCard;
  kind: RewardCurrency["kind"];
  /** Cents earned per dollar on spend with no earn rule (a 2x card at 1.5 cpp = 3). */
  catchAllCents: number;
  bonusCents: number;
  /** Net yearly value for the user's spend, in the current view. */
  valueCents: number;
}

export interface PickerFilters {
  q: string;
  issuerId: string;
  network: string;
  kind: string;
  /** Max annual fee in cents; null = any. */
  maxFeeCents: number | null;
  /** Min catch-all cents per dollar; 0 = any. */
  minCatchAllCents: number;
  hasBonus: boolean;
  noForeignFee: boolean;
  /** "personal" | "business" | "" (both). */
  audience: string;
}

export const NO_FILTERS: PickerFilters = {
  q: "",
  issuerId: "",
  network: "",
  kind: "",
  maxFeeCents: null,
  minCatchAllCents: 0,
  hasBonus: false,
  noForeignFee: false,
  audience: "",
};

export const PICKER_SORTS = {
  value: "Value for your spending",
  fee_asc: "Annual fee (low first)",
  fee_desc: "Annual fee (high first)",
  catch_all: "Catch-all rate (high first)",
  bonus: "Sign-up bonus (high first)",
  name: "Name (A-Z)",
} as const;
export type PickerSort = keyof typeof PICKER_SORTS;

export function pickerRows(
  cards: CreditCard[],
  currencies: Map<string, RewardCurrency>,
  spend: SpendProfile,
  options: ValuationOptions,
): PickerRow[] {
  return cards.map((card) => {
    const sub = card.signupBonus;
    return {
      card,
      kind: currencies.get(card.rewardCurrencyId)?.kind ?? "cash",
      catchAllCents: card.baseMultiplier * centsPerPointFor(card.rewardCurrencyId, options),
      bonusCents: sub ? Math.round(sub.amount * centsPerPointFor(sub.currencyId, options)) : 0,
      valueCents: annualValue(card, spend, options).totalCents,
    };
  });
}

export function filterAndSort(
  rows: PickerRow[],
  f: PickerFilters,
  sort: PickerSort,
  issuerName: (id: string) => string,
): PickerRow[] {
  const needle = f.q.trim().toLowerCase();
  const kept = rows.filter(({ card: c, kind, catchAllCents }) => {
    if (needle && !`${c.name} ${issuerName(c.issuerId)}`.toLowerCase().includes(needle)) return false;
    if (f.issuerId && c.issuerId !== f.issuerId) return false;
    if (f.network && c.network !== f.network) return false;
    if (f.kind && kind !== f.kind) return false;
    if (f.maxFeeCents !== null && c.annualFeeCents > f.maxFeeCents) return false;
    if (catchAllCents < f.minCatchAllCents) return false;
    if (f.hasBonus && !c.signupBonus) return false;
    if (f.noForeignFee && c.foreignTransactionFeeBps > 0) return false;
    if (f.audience && c.isBusiness !== (f.audience === "business")) return false;
    return true;
  });
  const key: Record<PickerSort, (r: PickerRow) => number> = {
    value: (r) => -r.valueCents,
    fee_asc: (r) => r.card.annualFeeCents,
    fee_desc: (r) => -r.card.annualFeeCents,
    catch_all: (r) => -r.catchAllCents,
    bonus: (r) => -r.bonusCents,
    name: () => 0,
  };
  // Name breaks every tie, so the order is stable and predictable.
  return kept.sort((a, b) => key[sort](a) - key[sort](b) || a.card.name.localeCompare(b.card.name));
}
