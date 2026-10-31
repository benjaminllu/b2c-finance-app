"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BonusOfferSchema } from "@optima/core";
import { deleteOffer, hasDatabase, markOfferVerified, saveOffer } from "@optima/db";

// Server actions for /admin/offers. /admin/* is behind HTTP Basic auth in middleware.ts.

const BACK = "/admin/offers";
const done = (msg: string): never => {
  revalidatePath(BACK);
  revalidatePath("/offers");
  revalidatePath("/banking");
  redirect(`${BACK}?saved=${encodeURIComponent(msg)}`);
};
const fail = (msg: string): never => redirect(`${BACK}?error=${encodeURIComponent(msg)}`);

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const textOrNull = (fd: FormData, k: string) => text(fd, k) || null;
const numOrNull = (fd: FormData, k: string) => (text(fd, k) === "" ? null : Number(text(fd, k)));
const flag = (fd: FormData, k: string) => fd.get(k) === "on";
const lines = (fd: FormData, k: string) =>
  text(fd, k)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

async function guarded(run: () => Promise<string>) {
  if (!hasDatabase()) fail("No database configured; admin writes are disabled.");
  let msg: string;
  try {
    msg = await run();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unexpected error.");
  }
  return done(msg);
}

export async function saveOfferAction(fd: FormData) {
  const productType = text(fd, "productType");
  const parsed = BonusOfferSchema.safeParse({
    id: text(fd, "id"),
    productType,
    institutionId: text(fd, "institutionId"),
    cardId: textOrNull(fd, "cardId"),
    depositProductId: textOrNull(fd, "depositProductId"),
    title: text(fd, "title"),
    bonusValue: Number(text(fd, "bonusValue") || 0),
    bonusCurrencyId: text(fd, "bonusCurrencyId") || "usd",
    requirements: {
      minSpendCents: numOrNull(fd, "minSpendCents"),
      spendWindowDays: numOrNull(fd, "spendWindowDays"),
      directDepositTotalCents: numOrNull(fd, "directDepositTotalCents"),
      directDepositCount: numOrNull(fd, "directDepositCount"),
      directDepositWindowDays: numOrNull(fd, "directDepositWindowDays"),
      minDepositCents: numOrNull(fd, "minDepositCents"),
      minBalanceCents: numOrNull(fd, "minBalanceCents"),
      holdingPeriodDays: numOrNull(fd, "holdingPeriodDays"),
      other: lines(fd, "other"),
    },
    monthlyFeeCents: Number(text(fd, "monthlyFeeCents") || 0),
    monthlyFeeWaivedByRequirements: flag(fd, "monthlyFeeWaivedByRequirements"),
    eligibility: {
      lifetimeLimit: flag(fd, "lifetimeLimit"),
      lookbackMonths: numOrNull(fd, "lookbackMonths"),
      lookbackScope: text(fd, "lookbackScope") || "product",
      notes: lines(fd, "notes"),
    },
    eligibleStates: text(fd, "eligibleStates")
      ? text(fd, "eligibleStates")
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((s) => s.toUpperCase())
      : null,
    earlyClosureFeeCents: Number(text(fd, "earlyClosureFeeCents") || 0),
    earlyClosureWindowDays: numOrNull(fd, "earlyClosureWindowDays"),
    hardPull: flag(fd, "hardPull"),
    bonusPostingDays: numOrNull(fd, "bonusPostingDays"),
    expiresAt: textOrNull(fd, "expiresAt"),
    sourceUrl: text(fd, "sourceUrl"),
    lastVerifiedAt: text(fd, "lastVerifiedAt") || new Date().toISOString(),
    isSample: flag(fd, "isSample"),
    affiliateUrl: textOrNull(fd, "affiliateUrl"),
    isAffiliate: flag(fd, "isAffiliate"),
  });
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await guarded(async () => {
    await saveOffer(parsed.data);
    return `Saved offer ${parsed.data.id}`;
  });
}

export async function deleteOfferAction(fd: FormData) {
  await guarded(async () => {
    await deleteOffer(text(fd, "id"));
    return `Deleted offer ${text(fd, "id")}`;
  });
}

export async function verifyOfferAction(fd: FormData) {
  await guarded(async () => {
    await markOfferVerified(text(fd, "id"));
    return `Marked offer ${text(fd, "id")} verified`;
  });
}
