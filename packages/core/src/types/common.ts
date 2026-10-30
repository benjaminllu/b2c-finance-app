import { z } from "zod";

/** Integer US cents. Core logic keeps every money value in integer cents. */
export const CentsSchema = z.number().int();
export const NonNegCentsSchema = z.number().int().nonnegative();
/** Basis points: 450 = 4.50%. */
export const BpsSchema = z.number().int().nonnegative();
/** Lowercase slug ids shared between seed JSON, the DB and URLs. */
export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase slug id");
/** Calendar date, YYYY-MM-DD. */
export const IsoDateSchema = z.iso.date();
/** Timestamp with offset, e.g. 2026-10-30T00:00:00Z. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
/** Two-letter US state or DC. */
export const StateCodeSchema = z.string().regex(/^[A-Z]{2}$/);

/** Every curated record says where it came from and when a human last checked it. */
export const ProvenanceSchema = z.object({
  sourceUrl: z.url(),
  lastVerifiedAt: IsoDateTimeSchema,
  isSample: z.boolean(),
});

/** Affiliate metadata. Ranking must never read these fields. */
export const AffiliateSchema = z.object({
  affiliateUrl: z.url().nullable(),
  isAffiliate: z.boolean(),
});

export type Cents = z.infer<typeof CentsSchema>;
export type Bps = z.infer<typeof BpsSchema>;
export type IsoDate = z.infer<typeof IsoDateSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
