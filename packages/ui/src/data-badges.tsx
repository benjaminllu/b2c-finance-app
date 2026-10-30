import { daysSince, isStale, type StalenessKind } from "@optima/core";
import { Badge } from "./primitives";

/** Shows "Verified N days ago", turning into a warning once past the staleness threshold. */
export function StalenessBadge({
  lastVerifiedAt,
  kind,
  now,
}: {
  lastVerifiedAt: string;
  kind: StalenessKind;
  now?: Date;
}) {
  const days = daysSince(lastVerifiedAt, now);
  const stale = isStale(lastVerifiedAt, kind, now);
  const label = days <= 0 ? "Verified today" : `Verified ${days}d ago`;
  return (
    <Badge variant={stale ? "warning" : "outline"} title={`Last verified ${lastVerifiedAt}`}>
      {stale ? `Stale: ${label.toLowerCase()}` : label}
    </Badge>
  );
}

/** Marks a single record as sample data. */
export function SampleBadge({ isSample }: { isSample: boolean }) {
  if (!isSample) return null;
  return <Badge variant="secondary">Sample data</Badge>;
}
