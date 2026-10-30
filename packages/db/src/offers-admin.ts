import type { BonusOffer } from "@optima/core";
import { offerToRow } from "./mappers";
import { getPrisma } from "./index";

// Admin writes for bonus offers. Callers validate with BonusOfferSchema first.

export const saveOffer = async (offer: BonusOffer): Promise<void> => {
  const { id, ...data } = offerToRow(offer);
  await getPrisma().bonusOffer.upsert({ where: { id }, create: { id, ...data }, update: data });
};

export const deleteOffer = async (id: string): Promise<void> => {
  await getPrisma().bonusOffer.delete({ where: { id } });
};

export const markOfferVerified = async (id: string): Promise<void> => {
  await getPrisma().bonusOffer.update({ where: { id }, data: { lastVerifiedAt: new Date() } });
};
