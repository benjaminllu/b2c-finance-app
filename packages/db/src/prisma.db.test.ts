import { seed } from "@optima/seed";
import { afterAll, describe, expect, it } from "vitest";
import { saveDepositProduct } from "./banking-admin";
import { getPrisma, hasDatabase } from "./index";
import { createPrismaStore } from "./prisma-store";
import { runSeed } from "./seed-logic";

// Runs only against a real, migrated Postgres (CI sets DATABASE_URL). Writes seed data into it.
describe.skipIf(!hasDatabase())("Prisma against Postgres", () => {
  afterAll(() => getPrisma().$disconnect());

  it("seeds idempotently", async () => {
    const store = createPrismaStore(getPrisma());
    await runSeed(store, seed);
    const second = await runSeed(store, seed);
    expect(second.rateHistoryAppended).toBe(0);
    expect(await getPrisma().creditCard.count()).toBeGreaterThanOrEqual(seed.cards.length);
  });

  it("admin save appends RateHistory only when tiers change", async () => {
    const prisma = getPrisma();
    const product = seed.depositProducts[0]!;
    await saveDepositProduct(product, "seed");
    const count = () => prisma.rateHistory.count({ where: { productId: product.id } });
    const before = await count();

    // jsonb reorders keys, so an unchanged save must not look like a rate change.
    expect((await saveDepositProduct(product)).rateRecorded).toBe(false);
    expect(await count()).toBe(before);

    const bumped = { ...product, apyTiers: product.apyTiers.map((t) => ({ ...t, apyBps: t.apyBps + 1 })) };
    expect((await saveDepositProduct(bumped, "test")).rateRecorded).toBe(true);
    expect(await count()).toBe(before + 1);

    await saveDepositProduct(product, "seed");
    await prisma.rateHistory.deleteMany({ where: { productId: product.id, source: "test" } });
  });
});
