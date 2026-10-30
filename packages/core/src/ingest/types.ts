import { z } from "zod";
import type { BonusOffer, CreditCard, DepositProduct } from "../types";
import { ApyTierSchema } from "../types/banking";
import { IdSchema, IsoDateTimeSchema } from "../types/common";

/** A rate observation for an existing deposit product: the current APY tiers as reported by a source. */
export const RateUpdateSchema = z.object({
  productId: IdSchema,
  apyTiers: z.array(ApyTierSchema).min(1),
  /** When the source says the rate was true. Becomes the product's lastVerifiedAt. */
  observedAt: IsoDateTimeSchema,
});
export type RateUpdate = z.infer<typeof RateUpdateSchema>;

/** What an adapter produces. */
export type IngestKind = "cards" | "offers" | "deposit_products" | "rates";

export interface KindRecord {
  cards: CreditCard;
  offers: BonusOffer;
  deposit_products: DepositProduct;
  rates: RateUpdate;
}

/** A record that failed normalization. `index` is the position in the raw array. */
export interface IngestError {
  index: number;
  message: string;
}

export interface NormalizeResult<T> {
  records: T[];
  errors: IngestError[];
}

/**
 * A source of external data. Adapters never write to the database; the runner (in @optima/db) does.
 * Method syntax is deliberate: it lets a DataSource<K, Row> be stored as DataSource<K, unknown>.
 */
export interface DataSource<K extends IngestKind = IngestKind, Raw = unknown> {
  /** Stable id; also the `source` written to RateHistory and the `adapterId` on IngestRun. */
  readonly id: string;
  readonly kind: K;
  fetch(): Promise<Raw[]>;
  /** Validate with the core Zod schemas; bad records become errors, never exceptions. */
  normalize(raw: Raw[]): NormalizeResult<KindRecord[K]>;
}

export type AnyDataSource = { [K in IngestKind]: DataSource<K, unknown> }[IngestKind];

/** Identity of a record within its kind. */
export function recordKey(kind: IngestKind, record: KindRecord[IngestKind]): string {
  return kind === "rates" ? (record as RateUpdate).productId : (record as { id: string }).id;
}
