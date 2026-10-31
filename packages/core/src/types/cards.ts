import { z } from "zod";
import { CategorySchema } from "./categories";
import { AffiliateSchema, BpsSchema, IdSchema, NonNegCentsSchema, ProvenanceSchema } from "./common";

export const IssuerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  website: z.url(),
  isSample: z.boolean(),
});
export type Issuer = z.infer<typeof IssuerSchema>;

/**
 * A points/miles/cash currency. Multipliers are "units per dollar"; for cash-back cards the unit is
 * one cent, so a 2% card has multiplier 2 and defaultCentsPerPoint 1.
 */
export const RewardCurrencySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  issuerId: IdSchema.nullable(),
  kind: z.enum(["cash", "points", "miles"]),
  /** Default value in cents per unit; users can override. */
  defaultCentsPerPoint: z.number().positive(),
  /** Where the default came from, shown next to the input. */
  valuationSource: z.string().min(1),
  valuationSourceUrl: z.url().nullable(),
  isSample: z.boolean(),
});
export type RewardCurrency = z.infer<typeof RewardCurrencySchema>;

export const CapPeriodSchema = z.enum(["monthly", "quarterly", "annual"]);
export type CapPeriod = z.infer<typeof CapPeriodSchema>;

export const QuarterSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Quarter = z.infer<typeof QuarterSchema>;

/** One spend cap, shared by every earn rule on the card that points at it. */
export const CapGroupSchema = z.object({
  id: IdSchema,
  /** Spend (not rewards) cap in cents per capPeriod. */
  capAmountCents: NonNegCentsSchema,
  capPeriod: CapPeriodSchema,
});
export type CapGroup = z.infer<typeof CapGroupSchema>;

export const EarnRuleSchema = z
  .object({
    category: CategorySchema,
    /** Units of the card's reward currency per dollar spent. */
    multiplier: z.number().nonnegative(),
    /** The card's capGroups entry this rule's spend counts against; null = uncapped. */
    capGroupId: IdSchema.nullable(),
    /** Multiplier after the cap is hit; null = the card's baseMultiplier. */
    afterCapMultiplier: z.number().nonnegative().nullable(),
    /** Rotating categories only apply in activeQuarters. */
    rotating: z.boolean(),
    activeQuarters: z.array(QuarterSchema).nullable(),
    /** Only earned when booking through the issuer's portal. */
    portalOnly: z.boolean(),
  })
  .refine((r) => !r.rotating || (r.activeQuarters?.length ?? 0) > 0, {
    message: "rotating rules need activeQuarters",
  });
export type EarnRule = z.infer<typeof EarnRuleSchema>;

export const CreditFrequencySchema = z.enum(["monthly", "quarterly", "semiannual", "annual", "multi_year"]);

export const CardCreditSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** Face value per year if fully used, in cents. */
  annualValueCents: NonNegCentsSchema,
  frequency: CreditFrequencySchema,
  /** Plain-English constraints, e.g. "Select merchants; enrollment required". */
  usageConstraints: z.string(),
});
export type CardCredit = z.infer<typeof CardCreditSchema>;

export const SignupBonusSchema = z.object({
  /** Units of currencyId (cents when the currency is cash). */
  amount: z.number().int().nonnegative(),
  currencyId: IdSchema,
  minSpendCents: NonNegCentsSchema,
  windowDays: z.number().int().positive(),
});
export type SignupBonus = z.infer<typeof SignupBonusSchema>;

export const CardNetworkSchema = z.enum(["visa", "mastercard", "amex", "discover"]);

export const CreditCardSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    issuerId: IdSchema,
    network: CardNetworkSchema,
    /** Groups sibling products for "one bonus per family" rules (e.g. "sapphire"). */
    productFamily: z.string().nullable(),
    annualFeeCents: NonNegCentsSchema,
    firstYearFeeWaived: z.boolean(),
    rewardCurrencyId: IdSchema,
    /** Multiplier for any category without an earn rule. */
    baseMultiplier: z.number().nonnegative(),
    earnRules: z.array(EarnRuleSchema),
    capGroups: z.array(CapGroupSchema),
    credits: z.array(CardCreditSchema),
    signupBonus: SignupBonusSchema.nullable(),
    isBusiness: z.boolean(),
    foreignTransactionFeeBps: BpsSchema,
  })
  .extend(ProvenanceSchema.shape)
  .extend(AffiliateSchema.shape)
  .superRefine((c, ctx) => {
    const ids = new Set(c.capGroups.map((g) => g.id));
    if (ids.size !== c.capGroups.length)
      ctx.addIssue({ code: "custom", path: ["capGroups"], message: "capGroups ids must be unique" });
    c.earnRules.forEach((r, i) => {
      if (r.capGroupId !== null && !ids.has(r.capGroupId))
        ctx.addIssue({
          code: "custom",
          path: ["earnRules", i, "capGroupId"],
          message: `no capGroups entry "${r.capGroupId}"`,
        });
    });
  });
export type CreditCard = z.infer<typeof CreditCardSchema>;
