import { z } from "zod";
import { SEED_FILES, seed } from "./index";

// Importing ./index already parses everything; this script reports every issue, not just the first.
let failed = false;
for (const [name, { data, schema }] of Object.entries(SEED_FILES)) {
  const result = z.array(schema as z.ZodType).safeParse(data);
  if (result.success) {
    console.log(`ok   ${name} (${(data as unknown[]).length} records)`);
  } else {
    failed = true;
    console.error(`FAIL ${name}\n${z.prettifyError(result.error)}`);
  }
}

/** Cross-file checks: unique ids per file and every reference resolves. Returns one message per problem. */
function crossReferenceIssues(s: typeof seed): string[] {
  const issues: string[] = [];
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const sets = {
    issuers: ids(s.issuers),
    currencies: ids(s.currencies),
    cards: ids(s.cards),
    banks: ids(s.banks),
    depositProducts: ids(s.depositProducts),
  };

  for (const [file, rows] of Object.entries(s)) {
    const seen = new Set<string>();
    for (const r of rows as { id: string }[]) {
      if (seen.has(r.id)) issues.push(`${file}: duplicate id "${r.id}"`);
      seen.add(r.id);
    }
  }

  const need = (where: string, field: string, value: string | null, set: Set<string>, target: string) => {
    if (value !== null && !set.has(value)) issues.push(`${where}.${field} "${value}" not found in ${target}`);
  };

  for (const c of s.currencies) need(`currencies/${c.id}`, "issuerId", c.issuerId, sets.issuers, "issuers");
  for (const c of s.cards) {
    need(`cards/${c.id}`, "issuerId", c.issuerId, sets.issuers, "issuers");
    need(`cards/${c.id}`, "rewardCurrencyId", c.rewardCurrencyId, sets.currencies, "currencies");
    need(
      `cards/${c.id}`,
      "signupBonus.currencyId",
      c.signupBonus?.currencyId ?? null,
      sets.currencies,
      "currencies",
    );
  }
  // The card engine keys credit utilization by credit id, so ids must be unique across all cards.
  const creditIds = new Set<string>();
  for (const c of s.cards) {
    for (const credit of c.credits) {
      if (creditIds.has(credit.id))
        issues.push(`cards/${c.id}: credit id "${credit.id}" reused across cards`);
      creditIds.add(credit.id);
    }
  }
  for (const p of s.depositProducts) need(`depositProducts/${p.id}`, "bankId", p.bankId, sets.banks, "banks");
  for (const o of s.offers) {
    const w = `offers/${o.id}`;
    need(w, "cardId", o.cardId, sets.cards, "cards");
    need(w, "depositProductId", o.depositProductId, sets.depositProducts, "depositProducts");
    need(w, "bonusCurrencyId", o.bonusCurrencyId, sets.currencies, "currencies");
    // Card offers point at an issuer, deposit offers at a bank; the same company shares one id.
    need(
      w,
      "institutionId",
      o.institutionId,
      o.productType === "credit_card" ? sets.issuers : sets.banks,
      o.productType === "credit_card" ? "issuers" : "banks",
    );
  }
  for (const r of s.rules) {
    for (const id of r.appliesTo.institutionIds) {
      if (!sets.issuers.has(id) && !sets.banks.has(id))
        issues.push(`rules/${r.id}.appliesTo.institutionIds "${id}" not found in issuers or banks`);
    }
  }
  return issues;
}

{
  const issues = crossReferenceIssues(seed);
  if (issues.length) {
    failed = true;
    console.error(`FAIL cross-references\n${issues.map((i) => `  - ${i}`).join("\n")}`);
  } else {
    console.log("ok   cross-references");
  }
  process.exit(failed ? 1 : 0);
}
