import type { BonusOffer, IsoDate } from "../types";
import { daysUntil } from "./filter";

/** What the user has done toward an offer (kept in their browser). */
export interface TrackerEntry {
  offerId: string;
  appliedAt: IsoDate;
  spentCents: number;
  directDepositCents: number;
}

export interface Progress {
  label: string;
  doneCents: number;
  targetCents: number;
  leftCents: number;
  deadline: IsoDate | null;
  daysLeft: number | null;
}

export interface TrackerStatus {
  progress: Progress[];
  /** Latest requirement deadline, null when no requirement has a window. */
  deadline: IsoDate | null;
  /** One plain-English reminder per open requirement. */
  reminders: string[];
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Deadlines are appliedAt + each requirement's window; reminders say what is left and how long. */
export function trackerStatus(offer: BonusOffer, entry: TrackerEntry, today: IsoDate): TrackerStatus {
  const r = offer.requirements;
  const progress: Progress[] = [];
  const add = (label: string, done: number, target: number | null, window: number | null) => {
    if (target === null || target <= 0) return;
    const deadline = window === null ? null : addDaysIso(entry.appliedAt, window);
    progress.push({
      label,
      doneCents: done,
      targetCents: target,
      leftCents: Math.max(0, target - done),
      deadline,
      daysLeft: deadline === null ? null : daysUntil(deadline, today),
    });
  };
  add("Minimum spend", entry.spentCents, r.minSpendCents, r.spendWindowDays);
  add("Direct deposit", entry.directDepositCents, r.directDepositTotalCents, r.directDepositWindowDays);

  const reminders = progress.map((p) => {
    if (p.leftCents === 0) return `${p.label}: done.`;
    if (p.daysLeft === null) return `${p.label}: ${usd(p.leftCents)} left.`;
    if (p.daysLeft < 0)
      return `${p.label}: ${usd(p.leftCents)} still short and the window ended ${-p.daysLeft} days ago.`;
    return `${usd(p.leftCents)} left for ${p.label.toLowerCase()} in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}.`;
  });
  const deadlines = progress.flatMap((p) => (p.deadline ? [p.deadline] : []));
  return {
    progress,
    deadline: deadlines.length ? deadlines.reduce((a, b) => (a > b ? a : b)) : null,
    reminders,
  };
}
