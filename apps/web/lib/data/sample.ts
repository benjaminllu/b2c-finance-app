import { getDepositProducts } from "./banking";
import { getCards } from "./cards";
import { getOffers } from "./offers";

/** True while any displayed record is still sample data; drives the site-wide banner. */
export async function hasSampleData(): Promise<boolean> {
  const [cards, products, offers] = await Promise.all([getCards(), getDepositProducts(), getOffers()]);
  return [...cards, ...products, ...offers].some((r) => r.isSample);
}
