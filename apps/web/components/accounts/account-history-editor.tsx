"use client";

import { useId, useState } from "react";
import { ProductTypeSchema, type AccountRecord, type ProductType } from "@optima/core";
import {
  Button,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@optima/ui";
import { useAccountHistory } from "@/lib/account-history";

export interface InstitutionOption {
  id: string;
  name: string;
}

export interface ProductOption {
  id: string;
  name: string;
  institutionId: string;
  productType: ProductType;
  productFamily: string | null;
}

const TYPE_LABELS: Record<ProductType, string> = {
  credit_card: "Credit card",
  checking: "Checking",
  savings: "Savings",
  money_market: "Money market",
};

/**
 * Lets the user record accounts they have opened (stored only in this browser).
 * Shared by the offers eligibility helper and the churn planner.
 */
export function AccountHistoryEditor({
  institutions,
  products,
}: {
  institutions: InstitutionOption[];
  products: ProductOption[];
}) {
  const [accounts, setAccounts] = useAccountHistory();
  const ids = useId();
  const [draft, setDraft] = useState({
    institutionId: institutions[0]?.id ?? "",
    productType: "credit_card" as ProductType,
    productId: "",
    name: "",
    openedAt: "",
    closedAt: "",
    bonusReceivedAt: "",
    isBusiness: false,
  });

  const matching = products.filter(
    (p) => p.institutionId === draft.institutionId && p.productType === draft.productType,
  );
  const instName = (id: string) => institutions.find((i) => i.id === id)?.name ?? id;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.institutionId || !draft.openedAt) return;
    const product = products.find((p) => p.id === draft.productId);
    const record: AccountRecord = {
      id: crypto.randomUUID(),
      institutionId: draft.institutionId,
      productType: draft.productType,
      productId: product?.id ?? null,
      productFamily: product?.productFamily ?? null,
      name:
        product?.name ?? (draft.name || `${instName(draft.institutionId)} ${TYPE_LABELS[draft.productType]}`),
      openedAt: draft.openedAt,
      closedAt: draft.closedAt || null,
      isBusiness: draft.isBusiness,
      bonusReceivedAt: draft.bonusReceivedAt || null,
    };
    setAccounts([...accounts, record].sort((a, b) => a.openedAt.localeCompare(b.openedAt)));
    setDraft({ ...draft, productId: "", name: "", openedAt: "", closedAt: "", bonusReceivedAt: "" });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Saved only in this browser. Optima never asks for account numbers or logins.
      </p>
      {accounts.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>Bonus received</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {a.name}
                  <span className="block text-xs text-muted-foreground">
                    {instName(a.institutionId)} · {TYPE_LABELS[a.productType]}
                    {a.isBusiness ? " · business" : ""}
                  </span>
                </TableCell>
                <TableCell>{a.openedAt}</TableCell>
                <TableCell>{a.closedAt ?? "Open"}</TableCell>
                <TableCell>{a.bonusReceivedAt ?? "-"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAccounts(accounts.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.name}`}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${ids}-inst`}>Bank or issuer</Label>
          <Select
            id={`${ids}-inst`}
            value={draft.institutionId}
            onChange={(e) => setDraft({ ...draft, institutionId: e.target.value, productId: "" })}
          >
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${ids}-type`}>Type</Label>
          <Select
            id={`${ids}-type`}
            value={draft.productType}
            onChange={(e) =>
              setDraft({ ...draft, productType: ProductTypeSchema.parse(e.target.value), productId: "" })
            }
          >
            {ProductTypeSchema.options.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${ids}-product`}>Product</Label>
          <Select
            id={`${ids}-product`}
            value={draft.productId}
            onChange={(e) => setDraft({ ...draft, productId: e.target.value })}
          >
            <option value="">Other / not listed</option>
            {matching.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {!draft.productId && (
          <div className="space-y-1">
            <Label htmlFor={`${ids}-name`}>Name (optional)</Label>
            <Input
              id={`${ids}-name`}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${ids}-opened`}>Opened</Label>
          <Input
            id={`${ids}-opened`}
            type="date"
            required
            value={draft.openedAt}
            onChange={(e) => setDraft({ ...draft, openedAt: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${ids}-closed`}>Closed (optional)</Label>
          <Input
            id={`${ids}-closed`}
            type="date"
            value={draft.closedAt}
            onChange={(e) => setDraft({ ...draft, closedAt: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${ids}-bonus`}>Bonus received (optional)</Label>
          <Input
            id={`${ids}-bonus`}
            type="date"
            value={draft.bonusReceivedAt}
            onChange={(e) => setDraft({ ...draft, bonusReceivedAt: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isBusiness}
              onChange={(e) => setDraft({ ...draft, isBusiness: e.target.checked })}
            />
            Business account
          </label>
          <Button type="submit">Add account</Button>
        </div>
      </form>
    </div>
  );
}
