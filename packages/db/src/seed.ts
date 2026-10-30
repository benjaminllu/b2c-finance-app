import { seed } from "@optima/seed";
import { getPrisma } from "./index";
import { createPrismaStore } from "./prisma-store";
import { runSeed } from "./seed-logic";

// pnpm db:seed. Safe to re-run: upserts by id and appends RateHistory only when rates changed.
async function main() {
  const prisma = getPrisma();
  try {
    const report = await runSeed(createPrismaStore(prisma), seed);
    console.log("seeded", report.counts, `rate history rows appended: ${report.rateHistoryAppended}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
