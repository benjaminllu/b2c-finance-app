import type { Bank, DepositProduct } from "@optima/core";
import { getRateHistory, hasDatabase, type RateHistoryEntry } from "@optima/db";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  StalenessBadge,
} from "@optima/ui";
import { PageHeader } from "@/components/page-header";
import { getBanks, getDepositProducts } from "@/lib/data/banking";
import { formatBps } from "@/lib/format";
import {
  deleteBankAction,
  deleteProductAction,
  saveBankAction,
  saveProductAction,
  verifyBankAction,
  verifyProductAction,
} from "./actions";

export const metadata = { title: "Admin: banking" };
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

function Choice({
  label,
  name,
  options,
  value,
  uid,
  ...rest
}: {
  label: string;
  name: string;
  uid: string;
  options: string[];
  value?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `${uid}-${name}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={name} defaultValue={value} {...rest}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}

function BankForm({ bank }: { bank?: Bank }) {
  const k = bank?.id ?? "new";
  return (
    <form action={saveBankAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lastVerifiedAt" value={bank?.lastVerifiedAt ?? ""} />
      <Field
        label="Id (slug)"
        name="id"
        defaultValue={bank?.id}
        readOnly={Boolean(bank)}
        required
        uid={`b-${k}`}
      />
      <Field label="Name" name="name" defaultValue={bank?.name} required uid={`b-${k}`} />
      <Choice label="Kind" name="kind" options={["bank", "credit_union"]} value={bank?.kind} uid={`b-${k}`} />
      <Choice
        label="Insurer"
        name="insurer"
        options={["FDIC", "NCUA"]}
        value={bank?.insurer}
        uid={`b-${k}`}
      />
      <Field label="Website" name="website" defaultValue={bank?.website} required uid={`b-${k}`} />
      <Field
        label="Source URL (required)"
        name="sourceUrl"
        defaultValue={bank?.sourceUrl}
        required
        uid={`b-${k}`}
      />
      <Field
        label="Membership requirement (blank = open to all)"
        name="membershipRequirement"
        defaultValue={bank?.membershipRequirement}
        uid={`b-${k}`}
      />
      <div className="space-y-2 pt-6">
        <Check label="Online only" name="onlineOnly" checked={bank?.onlineOnly} />
        <Check label="Sample data" name="isSample" checked={bank?.isSample ?? false} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">{bank ? "Save bank" : "Add bank"}</Button>
      </div>
    </form>
  );
}

function ProductForm({ product, banks }: { product?: DepositProduct; banks: Bank[] }) {
  const k = product?.id ?? "new";
  const f = `p-${k}`;
  return (
    <form action={saveProductAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lastVerifiedAt" value={product?.lastVerifiedAt ?? ""} />
      <Field
        label="Id (slug)"
        name="id"
        defaultValue={product?.id}
        readOnly={Boolean(product)}
        required
        uid={f}
      />
      <Choice label="Bank" name="bankId" options={banks.map((b) => b.id)} value={product?.bankId} uid={f} />
      <Field label="Name" name="name" defaultValue={product?.name} required uid={f} />
      <Choice
        label="Type"
        name="type"
        options={["checking", "savings", "money_market", "cd"]}
        value={product?.type}
        uid={f}
      />
      <Choice
        label="Tier mode"
        name="tierMode"
        options={["whole_balance", "blended"]}
        value={product?.tierMode}
        uid={f}
      />
      <Choice
        label="Compounding"
        name="compounding"
        options={["daily", "monthly"]}
        value={product?.compounding}
        uid={f}
      />
      <Field
        label="Min to open (cents)"
        name="minOpenCents"
        type="number"
        min={0}
        defaultValue={product?.minOpenCents ?? 0}
        uid={f}
      />
      <Field
        label="Min balance for APY (cents)"
        name="minBalanceForApyCents"
        type="number"
        min={0}
        defaultValue={product?.minBalanceForApyCents ?? 0}
        uid={f}
      />
      <Field
        label="Monthly fee (cents)"
        name="monthlyFeeCents"
        type="number"
        min={0}
        defaultValue={product?.monthlyFeeCents ?? 0}
        uid={f}
      />
      <Field
        label="CD term (months, CDs only)"
        name="cdTermMonths"
        type="number"
        min={1}
        defaultValue={product?.cdTermMonths}
        uid={f}
      />
      <Field
        label="Early withdrawal penalty (days of interest, CDs only)"
        name="earlyWithdrawalPenaltyDays"
        type="number"
        min={0}
        defaultValue={product?.earlyWithdrawalPenaltyDays}
        uid={f}
      />
      <Field
        label="Source URL (required)"
        name="sourceUrl"
        defaultValue={product?.sourceUrl}
        required
        uid={f}
      />
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${f}-tiers`}>
          APY tiers (JSON: minBalanceCents, maxBalanceCents|null, apyBps). Changing this adds a rate history
          row.
        </Label>
        <textarea
          id={`${f}-tiers`}
          name="apyTiers"
          rows={4}
          required
          defaultValue={JSON.stringify(
            product?.apyTiers ?? [{ minBalanceCents: 0, maxBalanceCents: null, apyBps: 400 }],
            null,
            2,
          )}
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${f}-waivers`}>
          Fee waivers (JSON: kind, thresholdCents|null, count|null, description)
        </Label>
        <textarea
          id={`${f}-waivers`}
          name="feeWaivers"
          rows={3}
          defaultValue={JSON.stringify(product?.feeWaivers ?? [], null, 2)}
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </div>
      <Field label="Affiliate URL" name="affiliateUrl" defaultValue={product?.affiliateUrl} uid={f} />
      <div className="space-y-2 pt-6">
        <Check label="Is affiliate" name="isAffiliate" checked={product?.isAffiliate} />
        <Check label="Sample data" name="isSample" checked={product?.isSample ?? false} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">{product ? "Save product" : "Add product"}</Button>
      </div>
    </form>
  );
}

function RowActions({
  id,
  verify,
  remove,
}: {
  id: string;
  verify: (fd: FormData) => Promise<void>;
  remove: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="flex gap-2">
      <form action={verify}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" size="sm">
          Mark verified now
        </Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="destructive" size="sm">
          Delete
        </Button>
      </form>
    </div>
  );
}

function History({ rows }: { rows: RateHistoryEntry[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No rate history yet.</p>;
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left font-medium">Rate history (newest first)</caption>
      <thead>
        <tr className="border-b text-left">
          <th scope="col" className="py-1">
            Recorded
          </th>
          <th scope="col">Source</th>
          <th scope="col">Tiers</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-b last:border-0 align-top">
            <td className="py-1 pr-3">{h.recordedAt.slice(0, 16).replace("T", " ")}</td>
            <td className="pr-3">{h.source}</td>
            <td>
              {h.apyTiers
                .map((t) => `${(t.minBalanceCents / 100).toLocaleString("en-US")}+: ${formatBps(t.apyBps)}`)
                .join("; ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminBankingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const db = hasDatabase();
  const [banks, products] = await Promise.all([getBanks(), getDepositProducts()]);
  const history = new Map<string, RateHistoryEntry[]>();
  if (db) for (const p of products) history.set(p.id, await getRateHistory(p.id));
  const bankName = new Map(banks.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banks and deposit products"
        description="Every record needs a source URL. Changing a product's APY tiers appends to its rate history."
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

      <Card>
        <CardHeader>
          <CardTitle>Banks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {banks.map((b) => (
            <details key={b.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{b.name}</span>
                <StalenessBadge lastVerifiedAt={b.lastVerifiedAt} kind="rates" />
              </summary>
              <div className="mt-3 space-y-3">
                <fieldset disabled={!db} className="space-y-3 disabled:opacity-60">
                  <BankForm bank={b} />
                  <RowActions id={b.id} verify={verifyBankAction} remove={deleteBankAction} />
                </fieldset>
              </div>
            </details>
          ))}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">Add a bank</summary>
            <fieldset disabled={!db} className="mt-3 disabled:opacity-60">
              <BankForm />
            </fieldset>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deposit products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.map((p) => (
            <details key={p.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">
                  {bankName.get(p.bankId) ?? p.bankId}: {p.name}
                </span>
                <span className="text-sm text-muted-foreground">{p.type}</span>
                <StalenessBadge lastVerifiedAt={p.lastVerifiedAt} kind="rates" />
              </summary>
              <div className="mt-3 space-y-4">
                <fieldset disabled={!db} className="space-y-3 disabled:opacity-60">
                  <ProductForm product={p} banks={banks} />
                  <RowActions id={p.id} verify={verifyProductAction} remove={deleteProductAction} />
                </fieldset>
                <History rows={history.get(p.id) ?? []} />
              </div>
            </details>
          ))}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">Add a deposit product</summary>
            <fieldset disabled={!db} className="mt-3 disabled:opacity-60">
              <ProductForm banks={banks} />
            </fieldset>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
