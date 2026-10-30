# Progress

Resume rule: read this file and `git log`, continue from the last completed checkpoint, do not redo finished waves.

## Status

- [x] Phase 0: foundation (monorepo, shared types, Prisma schema, app shell). Commit: "foundation".
- [x] Wave 1: Agent A (card math), Agent D (banking + effectiveApy), Agent E (seed data, db seed, ingest).
- [x] Wave 1 checkpoint. Commit: "wave 1 complete".
- [x] Lead shared pieces: `@optima/core/eligibility`, account-history store + editor.
- [x] Wave 2: Agent B (card UI), Agent C (offers), Agent G (planner).
- [x] Wave 2 checkpoint. Commit: "wave 2 complete".
- [ ] Agent F: quality and compliance pass.
- [ ] Phase 2: integration, README, roadmap.

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

## Open issues / decisions to review

- No Postgres here: Prisma code paths (admin writes, db:seed, ingest runner) are unexercised.
- No browser-driven check yet (Agent F's Playwright smoke test covers it).
- Two offer net-value functions: `offerNetValue` (offers) and `plannerOfferValue` (planner). They agree on all
  14 seed offers today; planner's early-closure logic is smarter (pays the fee only if cheaper than holding).
  Unify on one before real data lands.
- Card engine defaults: credit utilization 0; first-year view counts unreachable bonuses (flagged).
- Banking: deposits use compounded effective APY, bonuses simple annualization; ranking sorts by net dollars.
- Offers ROI for cards = net / required spend (sorting only).
- Planner ignores directDepositCount and eligibleStates; bank accounts treated as soft pulls.
- Ingest: unchanged rates do not bump lastVerifiedAt; adapters opt-in via INGEST_ADAPTERS.
- Schema suggestions (not applied): RateHistory tie-breaker index; Bank -> DepositProduct onDelete cascade;
  per-card cap groups; offer `hardPull` and `bonusPostingDays`.
