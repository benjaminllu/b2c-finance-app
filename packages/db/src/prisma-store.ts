import { ApyTierSchema, type ApyTier } from "@optima/core";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  bankFromRow,
  bankToRow,
  cardFromRow,
  cardToRow,
  currencyFromRow,
  depositProductFromRow,
  depositProductToRow,
  issuerFromRow,
  offerFromRow,
  offerToRow,
  ruleFromRow,
  ruleToRow,
} from "./mappers";
import type { DataStore } from "./store";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Postgres-backed DataStore. Rows go through the mappers, so reads and writes are Zod-checked. */
export function createPrismaStore(db: PrismaClient): DataStore {
  return {
    issuers: {
      list: async () => (await db.issuer.findMany()).map(issuerFromRow),
      upsert: async (r) => void (await db.issuer.upsert({ where: { id: r.id }, create: r, update: r })),
    },
    currencies: {
      list: async () => (await db.rewardCurrency.findMany()).map(currencyFromRow),
      upsert: async (r) =>
        void (await db.rewardCurrency.upsert({ where: { id: r.id }, create: r, update: r })),
    },
    cards: {
      list: async () => (await db.creditCard.findMany()).map(cardFromRow),
      upsert: async (c) => {
        // cardToRow maps a null bonus to undefined, which on update would keep a stale bonus; JsonNull clears it.
        const row = { ...cardToRow(c), signupBonus: c.signupBonus ? json(c.signupBonus) : Prisma.JsonNull };
        await db.creditCard.upsert({ where: { id: c.id }, create: row, update: row });
      },
    },
    banks: {
      list: async () => (await db.bank.findMany()).map(bankFromRow),
      upsert: async (b) =>
        void (await db.bank.upsert({ where: { id: b.id }, create: bankToRow(b), update: bankToRow(b) })),
    },
    depositProducts: {
      list: async () => (await db.depositProduct.findMany()).map(depositProductFromRow),
      upsert: async (p) => {
        const row = depositProductToRow(p);
        await db.depositProduct.upsert({ where: { id: p.id }, create: row, update: row });
      },
      latestRateTiers: async (productId): Promise<ApyTier[] | null> => {
        const last = await db.rateHistory.findFirst({
          where: { productId },
          orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        });
        return last ? z.array(ApyTierSchema).parse(last.apyTiers) : null;
      },
      appendRateHistory: async (productId, tiers, source, recordedAt) => {
        await db.rateHistory.create({ data: { productId, apyTiers: json(tiers), source, recordedAt } });
      },
      setRates: async (productId, tiers, lastVerifiedAt) => {
        await db.depositProduct.update({
          where: { id: productId },
          data: { apyTiers: json(tiers), lastVerifiedAt: new Date(lastVerifiedAt) },
        });
      },
    },
    offers: {
      list: async () => (await db.bonusOffer.findMany()).map(offerFromRow),
      upsert: async (o) =>
        void (await db.bonusOffer.upsert({
          where: { id: o.id },
          create: offerToRow(o),
          update: offerToRow(o),
        })),
    },
    rules: {
      list: async () => (await db.eligibilityRule.findMany()).map(ruleFromRow),
      upsert: async (r) => {
        const row = ruleToRow(r);
        await db.eligibilityRule.upsert({ where: { id: r.id }, create: row, update: row });
      },
    },
    runs: {
      start: async (adapterId, startedAt) =>
        (await db.ingestRun.create({ data: { adapterId, startedAt, status: "running" } })).id,
      finish: async (runId, r) => {
        await db.ingestRun.update({
          where: { id: runId },
          data: {
            status: r.status,
            created: r.created,
            updated: r.updated,
            unchanged: r.unchanged,
            error: r.error,
            log: json(r.log),
            finishedAt: r.finishedAt,
          },
        });
      },
    },
  };
}
