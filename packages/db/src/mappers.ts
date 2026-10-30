import type {
  Bank as BankRow,
  BonusOffer as BonusOfferRow,
  CreditCard as CreditCardRow,
  DepositProduct as DepositProductRow,
  EligibilityRule as EligibilityRuleRow,
  Issuer as IssuerRow,
  RewardCurrency as RewardCurrencyRow,
} from "@prisma/client";
import {
  BankSchema,
  BonusOfferSchema,
  CreditCardSchema,
  DepositProductSchema,
  EligibilityRuleSchema,
  IssuerSchema,
  RewardCurrencySchema,
  type Bank,
  type BonusOffer,
  type CreditCard,
  type DepositProduct,
  type EligibilityRule,
  type Issuer,
  type RewardCurrency,
} from "@optima/core";

// Row -> domain: parse through the core schemas so a bad JSON column fails loudly.
// Domain -> row: plain objects Prisma accepts for create/update.

const iso = (d: Date) => d.toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const issuerFromRow = (r: IssuerRow): Issuer => IssuerSchema.parse(r);
export const currencyFromRow = (r: RewardCurrencyRow): RewardCurrency => RewardCurrencySchema.parse(r);

export function cardFromRow(r: CreditCardRow): CreditCard {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return CreditCardSchema.parse({ ...rest, lastVerifiedAt: iso(r.lastVerifiedAt) });
}

export function cardToRow(c: CreditCard) {
  return { ...c, signupBonus: c.signupBonus ?? undefined, lastVerifiedAt: new Date(c.lastVerifiedAt) };
}

export function bankFromRow(r: BankRow): Bank {
  return BankSchema.parse({ ...r, lastVerifiedAt: iso(r.lastVerifiedAt) });
}

export function bankToRow(b: Bank) {
  return { ...b, lastVerifiedAt: new Date(b.lastVerifiedAt) };
}

export function depositProductFromRow(r: DepositProductRow): DepositProduct {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return DepositProductSchema.parse({ ...rest, lastVerifiedAt: iso(r.lastVerifiedAt) });
}

export function depositProductToRow(p: DepositProduct) {
  return { ...p, lastVerifiedAt: new Date(p.lastVerifiedAt) };
}

export function offerFromRow(r: BonusOfferRow): BonusOffer {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return BonusOfferSchema.parse({
    ...rest,
    eligibleStates: r.eligibleStates.length ? r.eligibleStates : null,
    expiresAt: r.expiresAt ? isoDate(r.expiresAt) : null,
    lastVerifiedAt: iso(r.lastVerifiedAt),
  });
}

export function offerToRow(o: BonusOffer) {
  return {
    ...o,
    eligibleStates: o.eligibleStates ?? [],
    expiresAt: o.expiresAt ? new Date(`${o.expiresAt}T00:00:00Z`) : null,
    lastVerifiedAt: new Date(o.lastVerifiedAt),
  };
}

export function ruleFromRow(r: EligibilityRuleRow): EligibilityRule {
  const { params, ...rest } = r;
  return EligibilityRuleSchema.parse({
    ...(params as object),
    ...rest,
    lastVerifiedAt: iso(r.lastVerifiedAt),
  });
}

export function ruleToRow(rule: EligibilityRule) {
  const { id, kind, name, description, appliesTo, sourceUrl, lastVerifiedAt, isSample, ...params } = rule;
  return {
    id,
    kind,
    name,
    description,
    appliesTo,
    params,
    sourceUrl,
    lastVerifiedAt: new Date(lastVerifiedAt),
    isSample,
  };
}
