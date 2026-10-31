import { ApyTierSchema, type ApyTier, type Bank, type DepositProduct } from "@optima/core";
import { jsonEqual } from "@optima/core/ingest";
import { bankToRow, depositProductToRow } from "./mappers";
import { getPrisma } from "./index";

// Admin writes for banks and deposit products. Callers validate with the core Zod schemas first.

export const saveBank = async (bank: Bank): Promise<void> => {
  const { id, ...data } = bankToRow(bank);
  await getPrisma().bank.upsert({ where: { id }, create: { id, ...data }, update: data });
};

/** Deleting a bank that still has products fails on the foreign key; delete its products first. */
export const deleteBank = async (id: string): Promise<void> => {
  await getPrisma().bank.delete({ where: { id } });
};

/**
 * Upserts a product. If it is new, or its apyTiers differ from the stored ones, appends a RateHistory row
 * (history is never overwritten).
 */
export const saveDepositProduct = async (
  product: DepositProduct,
  source = "admin",
): Promise<{ rateRecorded: boolean }> => {
  const prisma = getPrisma();
  const { id, ...data } = depositProductToRow(product);
  const existing = await prisma.depositProduct.findUnique({ where: { id }, select: { apyTiers: true } });
  // jsonb does not keep key order, so compare structurally.
  const changed = !existing || !jsonEqual(existing.apyTiers, product.apyTiers);
  await prisma.$transaction([
    prisma.depositProduct.upsert({ where: { id }, create: { id, ...data }, update: data }),
    ...(changed
      ? [prisma.rateHistory.create({ data: { productId: id, apyTiers: data.apyTiers, source } })]
      : []),
  ]);
  return { rateRecorded: changed };
};

export const deleteDepositProduct = async (id: string): Promise<void> => {
  await getPrisma().depositProduct.delete({ where: { id } });
};

export const markBankVerified = async (id: string): Promise<void> => {
  await getPrisma().bank.update({ where: { id }, data: { lastVerifiedAt: new Date() } });
};

export const markDepositProductVerified = async (id: string): Promise<void> => {
  await getPrisma().depositProduct.update({ where: { id }, data: { lastVerifiedAt: new Date() } });
};

export interface RateHistoryEntry {
  id: string;
  recordedAt: string;
  source: string;
  apyTiers: ApyTier[];
}

/** Newest first. */
export const getRateHistory = async (productId: string): Promise<RateHistoryEntry[]> => {
  const rows = await getPrisma().rateHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    recordedAt: r.recordedAt.toISOString(),
    source: r.source,
    apyTiers: ApyTierSchema.array().parse(r.apyTiers),
  }));
};
