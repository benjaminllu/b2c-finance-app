"use client";

import { useMemo } from "react";
import {
  US_STATES,
  type Bank,
  type BonusOffer,
  type CreditCard,
  type DepositProduct,
  type EligibilityRule,
  type Issuer,
  type RewardCurrency,
} from "@optima/core";
import { eligibilityByOffer } from "@optima/core/offers";
import {
  filterOffers,
  offerNetValue,
  parkedCashComparison,
  sortOffers,
  type OfferFilters,
  type OfferSortKey,
  type OfferView,
} from "@optima/core/offers";
import {
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@optima/ui";
import { AccountHistoryEditor } from "@/components/accounts/account-history-editor";
import { useAccountHistory } from "@/lib/account-history";
import { dollarsToCents, useUrlState } from "../banking/use-url-state";
import { OfferCard } from "./offer-card";
import { useTracker } from "./use-tracker";

const DEFAULTS = {
  tab: "cards",
  sort: "net",
  minBonus: "",
  maxSpend: "",
  dd: "any",
  state: "",
  inst: "",
  soon: "0",
  hide: "0",
};

export function OffersExplorer({
  offers,
  cards,
  issuers,
  banks,
  products,
  currencies,
  rules,
  nowIso,
}: {
  offers: BonusOffer[];
  cards: CreditCard[];
  issuers: Issuer[];
  banks: Bank[];
  products: DepositProduct[];
  currencies: RewardCurrency[];
  rules: EligibilityRule[];
  nowIso: string;
}) {
  const [s, update] = useUrlState(DEFAULTS);
  const [history] = useAccountHistory();
  const [entries, put] = useTracker();
  const today = nowIso.slice(0, 10);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of banks) m.set(b.id, b.name);
    for (const i of issuers) m.set(i.id, i.name);
    return m;
  }, [banks, issuers]);
  const institutions = useMemo(
    () => [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [names],
  );
  const productOptions = useMemo(
    () => [
      ...cards.map((c) => ({
        id: c.id,
        name: c.name,
        institutionId: c.issuerId,
        productType: "credit_card" as const,
        productFamily: c.productFamily,
      })),
      ...products.flatMap((p) =>
        p.type === "cd"
          ? []
          : [{ id: p.id, name: p.name, institutionId: p.bankId, productType: p.type, productFamily: null }],
      ),
    ],
    [cards, products],
  );

  const tab = s.tab === "bank" ? "bank" : "cards";
  const sort = (["net", "deadline", "roi"].includes(s.sort) ? s.sort : "net") as OfferSortKey;

  const live = useMemo(() => offers.filter((o) => !o.expiresAt || o.expiresAt >= today), [offers, today]);
  const elig = useMemo(
    () => (history.length ? eligibilityByOffer(live, { rules, history, asOf: today, cards }) : new Map()),
    [live, rules, history, today, cards],
  );
  const computed = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    return new Map(
      live.map((o) => {
        const net = offerNetValue(o, { currencies, cards });
        const parked = parkedCashComparison(
          o,
          o.depositProductId ? (productMap.get(o.depositProductId) ?? null) : null,
          products,
        );
        return [o.id, { net, parked }] as const;
      }),
    );
  }, [live, currencies, cards, products]);

  const filters: OfferFilters = {
    tab,
    minBonusCents: s.minBonus ? dollarsToCents(s.minBonus) : undefined,
    maxMinSpendCents: s.maxSpend ? dollarsToCents(s.maxSpend) : undefined,
    directDeposit: s.dd === "yes" || s.dd === "no" ? s.dd : "any",
    state: s.state || undefined,
    institutionId: s.inst || undefined,
    expiringSoon: s.soon === "1",
    hideIneligible: s.hide === "1",
  };
  const views: OfferView[] = live.map((o) => ({
    offer: o,
    bonusCents: computed.get(o.id)?.net.bonusCents ?? 0,
    netCents: computed.get(o.id)?.net.netCents ?? 0,
    eligibility: elig.get(o.id),
  }));
  const shown = sortOffers(filterOffers(views, filters, today), sort);
  const instOptions = institutions.filter((i) =>
    live.some((o) => o.institutionId === i.id && (o.productType === "credit_card") === (tab === "cards")),
  );
  const entryMap = new Map(entries.map((e) => [e.offerId, e]));

  const list = (
    <div className="space-y-4" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        {shown.length} offer{shown.length === 1 ? "" : "s"} shown. Expired offers are always hidden.
      </p>
      {shown.map((v) => {
        const c = computed.get(v.offer.id);
        if (!c) return null;
        return (
          <OfferCard
            key={v.offer.id}
            offer={v.offer}
            institution={names.get(v.offer.institutionId) ?? v.offer.institutionId}
            net={c.net}
            parked={c.parked}
            eligibility={v.eligibility}
            entry={entryMap.get(v.offer.id)}
            put={put}
            today={today}
            nowIso={nowIso}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="of-sort">Sort by</Label>
            <Select id="of-sort" value={sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="net">Net value (high first)</option>
              <option value="deadline">Deadline (soonest first)</option>
              <option value="roi">ROI (high first)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="of-state">Your state</Label>
            <Select id="of-state" value={s.state} onChange={(e) => update({ state: e.target.value })}>
              <option value="">Any state</option>
              {US_STATES.map((st) => (
                <option key={st}>{st}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="of-inst">{tab === "cards" ? "Issuer" : "Bank"}</Label>
            <Select id="of-inst" value={s.inst} onChange={(e) => update({ inst: e.target.value })}>
              <option value="">All</option>
              {instOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="of-min">Min bonus ($)</Label>
            <Input
              id="of-min"
              inputMode="decimal"
              value={s.minBonus}
              onChange={(e) => update({ minBonus: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="of-spend">Max min-spend ($)</Label>
            <Input
              id="of-spend"
              inputMode="decimal"
              value={s.maxSpend}
              onChange={(e) => update({ maxSpend: e.target.value })}
            />
          </div>
          {tab === "bank" && (
            <div className="space-y-1">
              <Label htmlFor="of-dd">Direct deposit</Label>
              <Select id="of-dd" value={s.dd} onChange={(e) => update({ dd: e.target.value })}>
                <option value="any">Any</option>
                <option value="no">Not required</option>
                <option value="yes">Required</option>
              </Select>
            </div>
          )}
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.soon === "1"}
                onChange={(e) => update({ soon: e.target.checked ? "1" : "0" })}
              />
              Expiring within 14 days
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.hide === "1"}
                onChange={(e) => update({ hide: e.target.checked ? "1" : "0" })}
              />
              Hide offers I&apos;m ineligible for
            </label>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Eligibility helper ({history.length} account{history.length === 1 ? "" : "s"} recorded)
        </summary>
        <p className="my-2 text-sm text-muted-foreground">
          Add accounts you have opened to flag offers you are likely ineligible for. Stored only in this
          browser. These are heuristics from public rules; always confirm on the issuer&apos;s terms.
        </p>
        <AccountHistoryEditor institutions={institutions} products={productOptions} />
      </details>

      <Tabs value={tab} onValueChange={(v) => update({ tab: v, inst: "" })}>
        <TabsList>
          <TabsTrigger value="cards">Credit cards</TabsTrigger>
          <TabsTrigger value="bank">Bank accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="cards">{list}</TabsContent>
        <TabsContent value="bank">{list}</TabsContent>
      </Tabs>
    </div>
  );
}
