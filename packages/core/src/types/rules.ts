import { z } from "zod";
import { IdSchema, ProvenanceSchema } from "./common";
import { ProductTypeSchema } from "./offers";

/** Which offers/accounts a rule governs. */
export const RuleScopeSchema = z.object({
  institutionIds: z.array(IdSchema).min(1),
  productTypes: z.array(ProductTypeSchema).min(1),
});

const base = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    description: z.string(),
    appliesTo: RuleScopeSchema,
  })
  .extend(ProvenanceSchema.shape);

/**
 * Institution eligibility rules, encoded as data so they can change without code changes.
 * Evaluated against the user's AccountRecord history.
 */
export const EligibilityRuleSchema = z.discriminatedUnion("kind", [
  /** e.g. "5/24": denied if >= count new accounts opened in windowMonths. */
  base.extend({
    kind: z.literal("max_new_accounts"),
    count: z.number().int().positive(),
    windowMonths: z.number().int().positive(),
    /** all_institutions counts accounts anywhere (5/24); same_institution only this issuer's. */
    countScope: z.enum(["all_institutions", "same_institution"]),
    countedProductTypes: z.array(ProductTypeSchema).min(1),
    countBusiness: z.boolean(),
  }),
  /** At most one application per institution every N days. */
  base.extend({
    kind: z.literal("min_days_between_apps"),
    days: z.number().int().positive(),
  }),
  /** Bonus once per lifetime per product or family. */
  base.extend({
    kind: z.literal("lifetime_bonus"),
    productScope: z.enum(["product", "product_family"]),
  }),
  /** No new bonus within N months of a prior one (measured from measureFrom). */
  base.extend({
    kind: z.literal("bonus_lookback"),
    months: z.number().int().positive(),
    productScope: z.enum(["product", "product_family", "institution"]),
    measureFrom: z.enum(["bonus_received", "account_opened", "account_closed"]),
  }),
  /** Cap on simultaneously open accounts with the institution. */
  base.extend({
    kind: z.literal("max_open_accounts"),
    count: z.number().int().positive(),
  }),
]);
export type EligibilityRule = z.infer<typeof EligibilityRuleSchema>;
export type EligibilityRuleKind = EligibilityRule["kind"];
