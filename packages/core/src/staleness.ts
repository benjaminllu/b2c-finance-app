/** Days after lastVerifiedAt before the UI shows a staleness badge. */
export const STALENESS_THRESHOLD_DAYS = { offers: 14, rates: 7, cards: 30 } as const;
export type StalenessKind = keyof typeof STALENESS_THRESHOLD_DAYS;

const DAY_MS = 86_400_000;

export function daysSince(isoDateTime: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(isoDateTime).getTime()) / DAY_MS);
}

export function isStale(
  lastVerifiedAt: string,
  kind: StalenessKind,
  now: Date = new Date(),
  thresholds: Record<StalenessKind, number> = STALENESS_THRESHOLD_DAYS,
): boolean {
  return daysSince(lastVerifiedAt, now) > thresholds[kind];
}
