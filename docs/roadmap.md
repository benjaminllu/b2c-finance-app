# Roadmap

## Before launch (blocking)

1. **Real, verified data.** Replace every `isSample: true` record with data checked against its source, and
   set up the verification cadence (offers every 14 days, rates every 7). The sample banner disappears on
   its own once no sample record is shown.
2. **Legal review** of disclosures, affiliate handling, and the data-source checklist.

Done: the database path was exercised against Postgres 16, and CI (`.github/workflows/ci.yml`) runs checks,
a Postgres migrate + seed + db-test job, and e2e on the pinned Chromium.

## Planned features

| Feature                               | Notes                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Downgrade and cancel advisor          | At annual-fee time, compare keep vs downgrade (same family, no fee) vs cancel, using the card engine and the user's real credit usage. Respect lookback rules that a cancel resets. |
| Crowdsourced retention offer log      | Users report retention offers by card and month; show the distribution. Needs moderation and abuse controls.                                                                        |
| Direct deposit compatibility database | Which ACH pushes each bank counts as direct deposit; feeds the planner's DD capacity.                                                                                               |
| Email and push deadline reminders     | Today reminders exist only in the UI tracker. Requires sign-in and a job runner.                                                                                                    |
| Rate alerts                           | Notify when a saved product's APY changes; `RateHistory` already records changes.                                                                                                   |
| After-tax bonus value                 | Bank bonuses are 1099-INT income (card bonuses generally are not); value at the user's marginal rate.                                                                               |
| Treasury comparison                   | T-bills and I/TIPS alongside HYSAs/CDs, with the state income tax exemption applied.                                                                                                |
| Opt-in spend import                   | Plaid or CSV import to build the spend profile. Opt-in, read-only, never store credentials.                                                                                         |
| Business card track                   | Separate business spend, business-card rules (most do not count toward 5/24), EIN/sole-prop notes.                                                                                  |
| Household / two-player planning       | Plan across two people: referral bonuses, authorized users, separate rule counts.                                                                                                   |
| Plain-English Q&A layer               | "Is the Sapphire Reserve worth it for me?" answered by calling the same engine and citing its math, never free-form numbers.                                                        |

## Recommended additions

- **Sign-in (Auth.js, email magic link + Google)** to sync the wallet, spend profile, account history, and
  tracker across devices. Deferred in v1; everything works anonymously today.
- **Referral bonus value** in the planner and offers feed.
- **Anniversary-aware card year** in the card engine (today the first card year is modelled as a calendar year).
- **Exact break-even chart sampling**: export cap breakpoints from `@optima/core/cards` so charts sample at
  every kink.
- **Planner fidelity**: respect `directDepositCount`, `eligibleStates` (add a state input), per-offer hard vs
  soft pull, and bonus posting delays as data (`bonusPostingDays`).
- **Ingestion**: let a source confirming an unchanged rate refresh `lastVerifiedAt` (with provenance), and
  add retries and batching.
- **Schema tweaks**: a `RateHistory` tie-breaker index, `onDelete: Cascade` from Bank to DepositProduct,
  per-card cap groups instead of repeating caps on each earn rule.
- **Observability**: error tracking and privacy-respecting product analytics (no personal data).
