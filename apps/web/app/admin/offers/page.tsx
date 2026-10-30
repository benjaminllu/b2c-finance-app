import type { BonusOffer } from "@optima/core";
import { isExpired } from "@optima/core/offers";
import { hasDatabase } from "@optima/db";
import { Alert, Button, Input, Label, Select, StalenessBadge } from "@optima/ui";
import { PageHeader } from "@/components/page-header";
import { getOffers } from "@/lib/data/offers";
import { deleteOfferAction, saveOfferAction, verifyOfferAction } from "./actions";

export const metadata = { title: "Admin: offers" };
export const dynamic = "force-dynamic";

function Field({
  label,
  name,
  defaultValue,
  uid,
  ...rest
}: { label: string; name: string; uid: string; defaultValue?: string | number | null } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "defaultValue"
>) {
  const id = `${uid}-${name}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} defaultValue={defaultValue ?? ""} {...rest} />
    </div>
  );
}

function Check({ label, name, checked }: { label: string; name: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} /> {label}
    </label>
  );
}

function Area({ label, name, value, uid }: { label: string; name: string; value: string; uid: string }) {
  const id = `${uid}-${name}`;
  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={2}
        defaultValue={value}
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
      />
    </div>
  );
}

function OfferForm({ offer }: { offer?: BonusOffer }) {
  const f = `o-${offer?.id ?? "new"}`;
  const r = offer?.requirements;
  const num = (name: string, label: string, v: number | null | undefined, min = 0) => (
    <Field label={label} name={name} type="number" min={min} defaultValue={v} uid={f} />
  );
  return (
    <form action={saveOfferAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lastVerifiedAt" value={offer?.lastVerifiedAt ?? ""} />
      <Field
        label="Id (slug)"
        name="id"
        defaultValue={offer?.id}
        readOnly={Boolean(offer)}
        required
        uid={f}
      />
      <Field label="Title" name="title" defaultValue={offer?.title} required uid={f} />
      <div className="space-y-1">
        <Label htmlFor={`${f}-productType`}>Product type</Label>
        <Select id={`${f}-productType`} name="productType" defaultValue={offer?.productType ?? "checking"}>
          {["credit_card", "checking", "savings", "money_market"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </div>
      <Field
        label="Institution id (issuer or bank)"
        name="institutionId"
        defaultValue={offer?.institutionId}
        required
        uid={f}
      />
      <Field label="Card id (card offers)" name="cardId" defaultValue={offer?.cardId} uid={f} />
      <Field
        label="Deposit product id (bank offers)"
        name="depositProductId"
        defaultValue={offer?.depositProductId}
        uid={f}
      />
      {num("bonusValue", "Bonus value (cents if usd, else points)", offer?.bonusValue)}
      <Field
        label="Bonus currency id (usd or a currency id)"
        name="bonusCurrencyId"
        defaultValue={offer?.bonusCurrencyId ?? "usd"}
        uid={f}
      />
      {num("minSpendCents", "Min spend (cents)", r?.minSpendCents)}
      {num("spendWindowDays", "Spend window (days)", r?.spendWindowDays, 1)}
      {num("directDepositTotalCents", "Direct deposit total (cents)", r?.directDepositTotalCents)}
      {num("directDepositCount", "Direct deposit count", r?.directDepositCount, 1)}
      {num("directDepositWindowDays", "Direct deposit window (days)", r?.directDepositWindowDays, 1)}
      {num("minDepositCents", "Min deposit (cents)", r?.minDepositCents)}
      {num("minBalanceCents", "Min balance (cents)", r?.minBalanceCents)}
      {num("holdingPeriodDays", "Holding period (days)", r?.holdingPeriodDays, 1)}
      {num("monthlyFeeCents", "Monthly fee (cents)", offer?.monthlyFeeCents ?? 0)}
      {num("earlyClosureFeeCents", "Early closure fee (cents)", offer?.earlyClosureFeeCents ?? 0)}
      {num("earlyClosureWindowDays", "Early closure window (days)", offer?.earlyClosureWindowDays, 1)}
      {num("lookbackMonths", "Eligibility lookback (months)", offer?.eligibility.lookbackMonths, 1)}
      <div className="space-y-1">
        <Label htmlFor={`${f}-lookbackScope`}>Lookback scope</Label>
        <Select
          id={`${f}-lookbackScope`}
          name="lookbackScope"
          defaultValue={offer?.eligibility.lookbackScope ?? "product"}
        >
          {["product", "product_family", "institution"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </div>
      <Field
        label="Expires (YYYY-MM-DD, blank = none)"
        name="expiresAt"
        defaultValue={offer?.expiresAt}
        uid={f}
      />
      <Field
        label="Eligible states (e.g. CA, NY; blank = nationwide)"
        name="eligibleStates"
        defaultValue={offer?.eligibleStates?.join(", ")}
        uid={f}
      />
      <Field
        label="Source URL (required)"
        name="sourceUrl"
        defaultValue={offer?.sourceUrl}
        type="url"
        required
        uid={f}
      />
      <Field label="Affiliate URL" name="affiliateUrl" defaultValue={offer?.affiliateUrl} uid={f} />
      <Area
        label="Other requirements (one per line)"
        name="other"
        value={r?.other.join("\n") ?? ""}
        uid={f}
      />
      <Area
        label="Eligibility notes (one per line)"
        name="notes"
        value={offer?.eligibility.notes.join("\n") ?? ""}
        uid={f}
      />
      <div className="space-y-2 sm:col-span-2">
        <Check
          label="Monthly fee waived by requirements"
          name="monthlyFeeWaivedByRequirements"
          checked={offer?.monthlyFeeWaivedByRequirements}
        />
        <Check label="Lifetime limit" name="lifetimeLimit" checked={offer?.eligibility.lifetimeLimit} />
        <Check label="Is affiliate" name="isAffiliate" checked={offer?.isAffiliate} />
        <Check label="Sample data" name="isSample" checked={offer?.isSample ?? false} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">{offer ? "Save offer" : "Add offer"}</Button>
      </div>
    </form>
  );
}

function OfferItem({ offer, db }: { offer: BonusOffer; db: boolean }) {
  return (
    <details className="rounded-lg border p-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="font-medium">{offer.title}</span>
        <span className="text-sm text-muted-foreground">
          {offer.expiresAt ? `expires ${offer.expiresAt}` : "no expiry"}
        </span>
        <StalenessBadge lastVerifiedAt={offer.lastVerifiedAt} kind="offers" />
      </summary>
      <fieldset disabled={!db} className="mt-3 space-y-3 disabled:opacity-60">
        <OfferForm offer={offer} />
        <div className="flex gap-2">
          <form action={verifyOfferAction}>
            <input type="hidden" name="id" value={offer.id} />
            <Button type="submit" variant="outline" size="sm">
              Mark verified now
            </Button>
          </form>
          <form action={deleteOfferAction}>
            <input type="hidden" name="id" value={offer.id} />
            <Button type="submit" variant="destructive" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </fieldset>
    </details>
  );
}

export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const db = hasDatabase();
  const today = new Date().toISOString().slice(0, 10);
  // Stalest first, so the offers most in need of a check are on top.
  const all = [...(await getOffers())].sort(
    (a, b) => a.lastVerifiedAt.localeCompare(b.lastVerifiedAt) || a.id.localeCompare(b.id),
  );
  const live = all.filter((o) => !isExpired(o, today));
  const expired = all.filter((o) => isExpired(o, today));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bonus offers"
        description="Every offer needs a source URL. Offers go stale after 14 days; the stalest are listed first."
      />
      {!db && (
        <Alert variant="warning">
          No database is configured (DATABASE_URL is unset), so the forms below are disabled and the lists
          show seed JSON. Start Postgres with <code>pnpm db:up</code>, then run <code>pnpm db:migrate</code>{" "}
          and <code>pnpm db:seed</code>.
        </Alert>
      )}
      {saved && <Alert role="status">{saved}</Alert>}
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      <section className="space-y-3" aria-labelledby="live-h">
        <h2 id="live-h" className="text-lg font-semibold">
          Live offers ({live.length})
        </h2>
        {live.map((o) => (
          <OfferItem key={o.id} offer={o} db={db} />
        ))}
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">Add an offer</summary>
          <fieldset disabled={!db} className="mt-3 disabled:opacity-60">
            <OfferForm />
          </fieldset>
        </details>
      </section>
      <section className="space-y-3" aria-labelledby="exp-h">
        <h2 id="exp-h" className="text-lg font-semibold">
          Expired offers ({expired.length})
        </h2>
        {expired.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
        {expired.map((o) => (
          <OfferItem key={o.id} offer={o} db={db} />
        ))}
      </section>
    </div>
  );
}
