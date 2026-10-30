import { z } from "zod";
import {
  AffiliateSchema,
  IdSchema,
  IsoDateSchema,
  NonNegCentsSchema,
  ProvenanceSchema,
  StateCodeSchema,
} from "./common";

export const ProductTypeSchema = z.enum(["credit_card", "checking", "savings", "money_market"]);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const OfferRequirementsSchema = z.object({
  minSpendCents: NonNegCentsSchema.nullable(),
  spendWindowDays: z.number().int().positive().nullable(),
  directDepositTotalCents: NonNegCentsSchema.nullable(),
  directDepositCount: z.number().int().positive().nullable(),
  directDepositWindowDays: z.number().int().positive().nullable(),
  /** New money that must be deposited. */
  minDepositCents: NonNegCentsSchema.nullable(),
  /** Balance that must be kept for holdingPeriodDays. */
  minBalanceCents: NonNegCentsSchema.nullable(),
  holdingPeriodDays: z.number().int().positive().nullable(),
  other: z.array(z.string()),
});
export type OfferRequirements = z.infer<typeof OfferRequirementsSchema>;

/** Per-offer eligibility terms. Institution-wide rules (e.g. 5/24) live in EligibilityRule. */
export const OfferEligibilitySchema = z.object({
  /** Bonus available once per lifetime. */
  lifetimeLimit: z.boolean(),
  /** Not eligible if a bonus (or account, per lookbackScope) was received within N months. */
  lookbackMonths: z.number().int().positive().nullable(),
  lookbackScope: z.enum(["product", "product_family", "institution"]),
  notes: z.array(z.string()),
});
export type OfferEligibility = z.infer<typeof OfferEligibilitySchema>;

export const BonusOfferSchema = z
  .object({
    id: IdSchema,
    productType: ProductTypeSchema,
    /** Issuer id for card offers, bank id for deposit offers. The same company shares one id. */
    institutionId: IdSchema,
    cardId: IdSchema.nullable(),
    depositProductId: IdSchema.nullable(),
    title: z.string().min(1),
    /** Units of bonusCurrencyId: cents when "usd", otherwise points/miles. */
    bonusValue: z.number().int().nonnegative(),
    bonusCurrencyId: IdSchema,
    requirements: OfferRequirementsSchema,
    /** Deposit offers: account monthly fee, and whether meeting the requirements waives it. */
    monthlyFeeCents: NonNegCentsSchema,
    monthlyFeeWaivedByRequirements: z.boolean(),
    eligibility: OfferEligibilitySchema,
    /** null = available nationwide. */
    eligibleStates: z.array(StateCodeSchema).nullable(),
    earlyClosureFeeCents: NonNegCentsSchema,
    /** Fee applies if closed within this many days of opening. */
    earlyClosureWindowDays: z.number().int().positive().nullable(),
    expiresAt: IsoDateSchema.nullable(),
  })
  .extend(ProvenanceSchema.shape)
  .extend(AffiliateSchema.shape)
  .refine((o) => o.productType !== "credit_card" || o.cardId !== null, {
    message: "credit_card offers need cardId",
  });
export type BonusOffer = z.infer<typeof BonusOfferSchema>;
