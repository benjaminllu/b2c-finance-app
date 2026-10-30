import { z } from "zod";
import { CATEGORIES, CategorySchema } from "./categories";
import { IdSchema, IsoDateSchema, NonNegCentsSchema } from "./common";
import { ProductTypeSchema } from "./offers";

/** Monthly spend in cents for every canonical category. */
export const SpendProfileSchema = z.record(CategorySchema, NonNegCentsSchema);
export type SpendProfile = z.infer<typeof SpendProfileSchema>;

export function emptySpendProfile(): SpendProfile {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as SpendProfile;
}

/** One account the user has opened, used for eligibility and planning. Never holds credentials. */
export const AccountRecordSchema = z.object({
  id: z.string().min(1),
  institutionId: IdSchema,
  productType: ProductTypeSchema,
  /** Card or deposit product id when known. */
  productId: IdSchema.nullable(),
  productFamily: z.string().nullable(),
  name: z.string(),
  openedAt: IsoDateSchema,
  closedAt: IsoDateSchema.nullable(),
  isBusiness: z.boolean(),
  bonusReceivedAt: IsoDateSchema.nullable(),
});
export type AccountRecord = z.infer<typeof AccountRecordSchema>;
