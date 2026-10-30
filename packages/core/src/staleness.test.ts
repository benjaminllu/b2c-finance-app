import { describe, expect, it } from "vitest";
import { daysSince, isStale } from "./staleness";

describe("staleness", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("counts whole days", () => {
    expect(daysSince("2026-10-20T12:00:00Z", now)).toBe(10);
  });
  it("flags offers older than 14 days and rates older than 7", () => {
    expect(isStale("2026-10-16T11:00:00Z", "offers", now)).toBe(false);
    expect(isStale("2026-10-15T11:00:00Z", "offers", now)).toBe(true);
    expect(isStale("2026-10-22T11:00:00Z", "rates", now)).toBe(true);
  });
});
