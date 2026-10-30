import { z } from "zod";
import { AffiliateSchema, BpsSchema, IdSchema, NonNegCentsSchema, ProvenanceSchema } from "./common";

export const InsurerSchema = z.enum(["FDIC", "NCUA"]);

export const BankSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    kind: z.enum(["bank", "credit_union"]),
    insurer: InsurerSchema,
    onlineOnly: z.boolean(),
    /** Credit union field-of-membership requirement in plain English; null = open to all. */
    membershipRequirement: z.string().nullable(),
    website: z.url(),
  })
  .extend(ProvenanceSchema.shape);
export type Bank = z.infer<typeof BankSchema>;

export const DepositProductTypeSchema = z.enum(["checking", "savings", "money_market", "cd"]);
export type DepositProductType = z.infer<typeof DepositProductTypeSchema>;

export const ApyTierSchema = z.object({
  minBalanceCents: NonNegCentsSchema,
  /** Inclusive upper bound; null = no upper bound. */
  maxBalanceCents: NonNegCentsSchema.nullable(),
  apyBps: BpsSchema,
});
export type ApyTier = z.infer<typeof ApyTierSchema>;

export const FeeWaiverSchema = z.object({
  kind: z.enum([
    "min_daily_balance",
    "min_average_balance",
    "direct_deposit",
    "debit_transactions",
    "age_under",
    "other",
  ]),
  thresholdCents: NonNegCentsSchema.nullable(),
  count: z.number().int().nonnegative().nullable(),
  description: z.string(),
});
export type FeeWaiver = z.infer<typeof FeeWaiverSchema>;

export const DepositProductSchema = z
  .object({
    id: IdSchema,
    bankId: IdSchema,
    name: z.string().min(1),
    type: DepositProductTypeSchema,
    /** Sorted ascending by minBalanceCents. */
    apyTiers: z.array(ApyTierSchema).min(1),
    /** whole_balance: the tier the balance falls in applies to all of it. blended: each slice earns its tier. */
    tierMode: z.enum(["whole_balance", "blended"]),
    compounding: z.enum(["daily", "monthly"]),
    minOpenCents: NonNegCentsSchema,
    minBalanceForApyCents: NonNegCentsSchema,
    monthlyFeeCents: NonNegCentsSchema,
    feeWaivers: z.array(FeeWaiverSchema),
    /** CDs only. */
    cdTermMonths: z.number().int().positive().nullable(),
    /** CDs only: penalty expressed as days of interest. */
    earlyWithdrawalPenaltyDays: z.number().int().nonnegative().nullable(),
  })
  .extend(ProvenanceSchema.shape)
  .extend(AffiliateSchema.shape)
  .refine((p) => (p.type === "cd") === (p.cdTermMonths !== null), {
    message: "cdTermMonths is required for CDs and must be null otherwise",
  });
export type DepositProduct = z.infer<typeof DepositProductSchema>;
