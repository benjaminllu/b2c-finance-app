import type { EligibilityRule } from "@optima/core";
import { getPrisma, hasDatabase, ruleFromRow } from "@optima/db";
import { seed } from "@optima/seed";

// Server-only. Reads Postgres when DATABASE_URL is set, otherwise the validated seed JSON.

export async function getRules(): Promise<EligibilityRule[]> {
  if (!hasDatabase()) return seed.rules;
  return (await getPrisma().eligibilityRule.findMany()).map(ruleFromRow);
}
