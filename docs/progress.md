# Progress

Resume rule: read this file and `git log`, continue from the last completed checkpoint, do not redo finished waves.

## Status

- [x] Phase 0: foundation (monorepo, shared types, Prisma schema, app shell). Commit: "foundation".
- [x] Wave 1: Agent A (card math), Agent D (banking + effectiveApy), Agent E (seed data, db seed, ingest).
- [x] Wave 1 checkpoint. Commit: "wave 1 complete".
- [x] Lead shared pieces: `@optima/core/eligibility`, account-history store + editor.
- [x] Wave 2: Agent B (card UI), Agent C (offers), Agent G (planner).
- [x] Wave 2 checkpoint. Commit: "wave 2 complete".
- [x] Agent F: quality and compliance pass (docs/quality-report.md; Playwright smoke + axe, 34 tests).
- [x] Phase 2: integration, README, roadmap. Commit: "integration: quality fixes, README, roadmap".

## Done in Wave 2

- `/cards` (B): picker, side-by-side, spend presets, credit-use reality check, point valuations, winner + reason,
  baseline, break-even table + chart, utilization/fee break-evens, wallet, sensitivity; all inputs in the URL.
- `@optima/core/offers` + `/offers` + `/admin/offers` (C): offerNetValue, parked-cash APY vs best HYSA,
  filters/sort in URL, eligibility flags via checkEligibility, localStorage tracker with reminders.
- `@optima/core/planner` + `/planner` (G): deterministic beam search (width 8) over offers x months with
  eligibility (planned accounts count), spend/DD/split/parked-cash capacity, 6/12-month pull limits, expiry,
  lock/exclude; reasons per step and "why not" per skipped offer.
- Checkpoint fixes: bonus ranking now puts cash above the requirement in the best savings/MM account
  (`excessCashProduct`); web Vitest `@/` alias. Checks: typecheck, 110 tests, lint, seed:validate; all pages 200.

- [x] Post-v1 step 1: database path exercised on a real Postgres 16. Step 2: CI workflow added.

## Done in post-v1 steps 1-2

- Ran against Postgres 16 (embedded-postgres, no Docker on the dev machine): migrate, `db:seed` x2 (second run
  appends 0 rate rows), every page 200 on the DB path, admin save/edit/verify through the real forms, bad-JSON
  error, cron ingest 401 without secret and idempotent with `INGEST_ADAPTERS=sample-rates-csv`.
- Fixed: `db:seed` never loaded `.env` (tsx doesn't); it now loads it when present.
- Fixed: admin `saveDepositProduct` compared tiers with JSON.stringify, but jsonb reorders keys, so every
  unchanged save appended a RateHistory row. Now uses `jsonEqual`. Covered by `packages/db/src/prisma.db.test.ts`
  (skipped unless DATABASE_URL is set; runs in the CI db job).
- e2e pins `DATABASE_URL=""` so it always runs in seed mode, even with a local `.env`.
- CI: `.github/workflows/ci.yml` has `check`, `db` (Postgres service) and `e2e` (pinned Chromium) jobs. First run on
  GitHub (commit 6fd0895) passed.
- Step 3 done (migration `20261031074004_cap_groups_offer_pull_cascade`): card-level `capGroups` with
  `EarnRule.capGroupId` (validated; replaces per-rule capAmountCents/capPeriod/capGroup and the engine's
  "same cap" shortcut); offer `hardPull` + `bonusPostingDays`; Bank -> DepositProduct cascade (admin delete
  needs a confirm checkbox when products exist); RateHistory (productId, recordedAt, id) index + id tie-break.
  The migration backfills old rows; checked on a DB loaded with the pre-migration seed (all 15 cards match
  the converted seed JSON). Seed hardPull = productType is credit_card; bonusPostingDays null (unknown).
- Owner request: `/cards` picker filters (search, issuer, annual fee, catch-all rate, rewards kind, network,
  personal/business, has bonus, no FX fee) and sorts (value for your spending, fee, catch-all, bonus, name).
  Catch-all and bonus are valued at the user's cents-per-point; logic in `components/cards/picker.ts` (tested).
  Filter state is local to the picker, not in the URL.
- Step 4 done: the planner counts pulls by `offer.hardPull` (history: credit cards count as hard pulls);
  bonus date = requirement windows + `bonusPostingDays` (unknown = 0, flagged in the timeline); a
  `directDepositCount`-only requirement takes a DD split; `/planner` has a state input (`st` in the URL) that
  skips offers outside `eligibleStates`, and flags them when no state is set. `offerNetValue` keeps deposit
  accounts open until the bonus posts, so monthly fees cover the posting wait. `US_STATES` now lives in core.
- Step 5 done: ingestion moves `lastVerifiedAt` forward (never back) when a source confirms an unchanged
  record, for rates and for whole records (cards, offers, deposit products). Provenance is the IngestRun
  log line `verified <id> ... as of <date>` (the run row names the adapter). `runIngest` retries the fetch
  (3 attempts, 1s/2s backoff; writes are not retried) and reports a `verified` count, also in the cron JSON.
- Owner request: `/cards` picker in 3 columns on wide screens; the compare columns are ordered by value with
  the winner first, outlined and badged "Our pick for your spending" (updates as cards are added/removed).
- Next: step 6 (verified data) is the owner's job; then step 7 (sign-in with Auth.js), step 8 (roadmap).

## Open issues / decisions to review

Everything outstanding lives here. Owner action items first.

- Owner: every record is still `isSample: true`; step 6 (replace with verified data) is the owner's job.
  When verifying offers, also fill `bonusPostingDays` (all null) and check `hardPull` (seeded as "cards are
  hard pulls, bank accounts soft").
- Owner: Marriott Bonvoy Boundless sample rules cap groceries, gas and dining at $6,000 each; the real card
  may share one cap. Converted as-is.
- Owner: CI status of pushes after 6fd0895 not checked from the dev machine (no `gh` CLI); see GitHub Actions.
- Dev machine: local Postgres is embedded-postgres; `optima_v2` is the active DB (`optima` has a stale
  migration checksum from before the step 3 migration was edited; drop it or `migrate reset` with consent).

- Local e2e still uses PW_CHROMIUM_PATH: on the dev machine a `playwright install chromium` started at
  2026-10-30 14:52 hung. Downloads from this machine stall; installing chromium-headless-shell also garbage-
  collected chromium-1193. Use PW_CHROMIUM_PATH=chromium-1234 locally; CI installs the pinned build fine.
- Resolved: offer net value has one implementation (`offerNetValue`); the planner adapts it.
- Card engine defaults: credit utilization 0; first-year view counts unreachable bonuses (flagged).
- Banking: deposits use compounded effective APY, bonuses simple annualization; ranking sorts by net dollars.
- Offers ROI for cards = net / required spend (sorting only).
- Planner: DD count only reserves a split (no per-deposit amount or pay-frequency check); unknown posting
  delay counts as 0 days.
- Ingest: adapters opt-in via INGEST_ADAPTERS. Re-verification provenance is only in the IngestRun log (no
  per-record "verified by" field); a feed re-verifying a sample record does not clear `isSample`. Batching
  (roadmap) not done; writes are one record at a time.
- `/cards` picker filters and sort are not in the URL (card choices and inputs are).
