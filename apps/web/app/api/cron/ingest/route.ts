import { NextResponse } from "next/server";
import { createPrismaStore, getEnabledAdapters, getPrisma, hasDatabase, runIngest } from "@optima/db";

export const dynamic = "force-dynamic";

// Scheduled by vercel.json. Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL is not set; nothing to ingest into." }, { status: 503 });
  }

  const adapters = getEnabledAdapters();
  const store = createPrismaStore(getPrisma());
  const results = [];
  for (const adapter of adapters) {
    // runIngest records failures on the IngestRun row instead of throwing, so one bad adapter doesn't stop the rest.
    const { adapterId, runId, status, created, updated, unchanged, errors } = await runIngest(store, adapter);
    results.push({ adapterId, runId, status, created, updated, unchanged, errorCount: errors.length });
  }
  return NextResponse.json({ ran: results.length, results });
}
