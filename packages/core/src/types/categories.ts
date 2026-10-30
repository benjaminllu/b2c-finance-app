import { z } from "zod";

/** Fixed canonical spend categories. Every earn rule and spend profile uses these. */
export const CATEGORIES = [
  "groceries",
  "dining",
  "gas",
  "travel",
  "airfare",
  "hotels",
  "transit",
  "streaming",
  "drugstores",
  "online_retail",
  "utilities",
  "other",
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining",
  gas: "Gas",
  travel: "Other travel",
  airfare: "Airfare",
  hotels: "Hotels",
  transit: "Transit & rideshare",
  streaming: "Streaming",
  drugstores: "Drugstores",
  online_retail: "Online retail",
  utilities: "Utilities & phone",
  other: "Everything else",
};

/**
 * Issuer-specific category names (lowercased) mapped onto canonical categories.
 * One issuer category can cover several canonical ones ("travel" covers airfare, hotels, ...).
 */
export const ISSUER_CATEGORY_MAP: Record<string, readonly Category[]> = {
  supermarkets: ["groceries"],
  "u.s. supermarkets": ["groceries"],
  "grocery stores": ["groceries"],
  grocery: ["groceries"],
  restaurants: ["dining"],
  dining: ["dining"],
  "takeout and delivery": ["dining"],
  "gas stations": ["gas"],
  "u.s. gas stations": ["gas"],
  "ev charging": ["gas"],
  travel: ["travel", "airfare", "hotels", "transit"],
  flights: ["airfare"],
  airlines: ["airfare"],
  hotels: ["hotels"],
  "car rentals": ["travel"],
  transit: ["transit"],
  rideshare: ["transit"],
  "streaming services": ["streaming"],
  "select streaming": ["streaming"],
  drugstores: ["drugstores"],
  pharmacies: ["drugstores"],
  "online retail": ["online_retail"],
  "amazon.com": ["online_retail"],
  "u.s. online retail purchases": ["online_retail"],
  utilities: ["utilities"],
  "phone and internet": ["utilities"],
  "cable and wireless": ["utilities"],
  "everything else": ["other"],
  "all other purchases": ["other"],
};

/** Canonical categories for an issuer label; unknown labels fall into "other". */
export function mapIssuerCategory(label: string): readonly Category[] {
  return ISSUER_CATEGORY_MAP[label.trim().toLowerCase()] ?? ["other"];
}
