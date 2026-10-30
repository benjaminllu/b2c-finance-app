"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BankSchema, DepositProductSchema } from "@optima/core";
import {
  deleteBank,
  deleteDepositProduct,
  hasDatabase,
  markBankVerified,
  markDepositProductVerified,
  saveBank,
  saveDepositProduct,
} from "@optima/db";

// Server actions for /admin/banking. /admin/* is behind HTTP Basic auth in middleware.ts.
// Each action validates with the core Zod schemas, then redirects back with a message.

const BACK = "/admin/banking";
const done = (msg: string): never => {
  revalidatePath(BACK);
  revalidatePath("/banking");
  redirect(`${BACK}?saved=${encodeURIComponent(msg)}`);
};
const fail = (msg: string): never => redirect(`${BACK}?error=${encodeURIComponent(msg)}`);

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const textOrNull = (fd: FormData, k: string) => text(fd, k) || null;
const numOrNull = (fd: FormData, k: string) => (text(fd, k) === "" ? null : Number(text(fd, k)));
const flag = (fd: FormData, k: string) => fd.get(k) === "on";

function json(fd: FormData, k: string): unknown {
  try {
    return JSON.parse(text(fd, k) || "[]");
  } catch {
    return fail(`${k} is not valid JSON.`);
  }
}

function requireDb() {
  if (!hasDatabase()) fail("No database configured; admin writes are disabled.");
}

async function guarded(run: () => Promise<string>) {
  requireDb();
  let msg: string;
  try {
    msg = await run();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unexpected error.");
  }
  return done(msg);
}

export async function saveBankAction(fd: FormData) {
  const parsed = BankSchema.safeParse({
    id: text(fd, "id"),
    name: text(fd, "name"),
    kind: text(fd, "kind"),
    insurer: text(fd, "insurer"),
    onlineOnly: flag(fd, "onlineOnly"),
    membershipRequirement: textOrNull(fd, "membershipRequirement"),
    website: text(fd, "website"),
    sourceUrl: text(fd, "sourceUrl"),
    lastVerifiedAt: text(fd, "lastVerifiedAt") || new Date().toISOString(),
    isSample: flag(fd, "isSample"),
  });
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await guarded(async () => {
    await saveBank(parsed.data);
    return `Saved bank ${parsed.data.id}`;
  });
}

export async function saveProductAction(fd: FormData) {
  const parsed = DepositProductSchema.safeParse({
    id: text(fd, "id"),
    bankId: text(fd, "bankId"),
    name: text(fd, "name"),
    type: text(fd, "type"),
    apyTiers: json(fd, "apyTiers"),
    tierMode: text(fd, "tierMode"),
    compounding: text(fd, "compounding"),
    minOpenCents: Number(text(fd, "minOpenCents") || 0),
    minBalanceForApyCents: Number(text(fd, "minBalanceForApyCents") || 0),
    monthlyFeeCents: Number(text(fd, "monthlyFeeCents") || 0),
    feeWaivers: json(fd, "feeWaivers"),
    cdTermMonths: numOrNull(fd, "cdTermMonths"),
    earlyWithdrawalPenaltyDays: numOrNull(fd, "earlyWithdrawalPenaltyDays"),
    sourceUrl: text(fd, "sourceUrl"),
    lastVerifiedAt: text(fd, "lastVerifiedAt") || new Date().toISOString(),
    isSample: flag(fd, "isSample"),
    affiliateUrl: textOrNull(fd, "affiliateUrl"),
    isAffiliate: flag(fd, "isAffiliate"),
  });
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await guarded(async () => {
    const { rateRecorded } = await saveDepositProduct(parsed.data, "admin");
    return `Saved product ${parsed.data.id}${rateRecorded ? " (rate history row added)" : ""}`;
  });
}

export async function deleteBankAction(fd: FormData) {
  await guarded(async () => {
    await deleteBank(text(fd, "id"));
    return `Deleted bank ${text(fd, "id")}`;
  });
}

export async function deleteProductAction(fd: FormData) {
  await guarded(async () => {
    await deleteDepositProduct(text(fd, "id"));
    return `Deleted product ${text(fd, "id")}`;
  });
}

export async function verifyBankAction(fd: FormData) {
  await guarded(async () => {
    await markBankVerified(text(fd, "id"));
    return `Marked bank ${text(fd, "id")} verified`;
  });
}

export async function verifyProductAction(fd: FormData) {
  await guarded(async () => {
    await markDepositProductVerified(text(fd, "id"));
    return `Marked product ${text(fd, "id")} verified`;
  });
}
