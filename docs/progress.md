# Progress

Resume rule: read this file and `git log`, continue from the last completed checkpoint, do not redo finished waves.

## Status

- [x] Phase 0: foundation (monorepo, shared types, Prisma schema, app shell). Commit: "foundation".
- [x] Wave 1: Agent A (card math), Agent D (banking + effectiveApy), Agent E (seed data, db seed, ingest).
- [x] Wave 1 checkpoint. Commit: "wave 1 complete".
- [ ] Wave 2: Agent B (card UI), Agent C (offers), Agent G (planner).
- [ ] Wave 2 checkpoint. Commit: "wave 2 complete".
- [ ] Agent F: quality and compliance pass.
- [ ] Phase 2: integration, README, roadmap.

## Done in Wave 1

- `@optima/core/cards` (A): annualValue, breakEvenSpend, breakEvenCreditUtilization, breakEvenAnnualFee,
  signupBonusFeasibility, optimizeWallet, flatRateCard, sensitivity, effectiveAnnualFee. 99.8% statement coverage.
- `@optima/core/banking` (D): effectiveApy (shared contract), projectGrowth, cdMaturity, analyzeEarlyWithdrawal,
  buildCdLadder, rankCashOptions. `/banking` UI and `/admin/banking` (CRUD, mark verified, append-only rate history).
- Seed (E): 15 cards, 14 offers, 20 deposit products, 13 banks, 7 currencies, 14 rules; validator with
  cross-reference checks. Idempotent `db:seed`, `@optima/core/ingest` (DataSource, diffRecords, CSV adapter),
  `runIngest`, cron route `/api/cron/ingest` (opt-in adapters via INGEST_ADAPTERS), `docs/data-sources.md`.
- Checkpoint: typecheck, 66 tests, lint, seed:validate all pass; every page returns 200.

## Next

Wave 2: B (card UI on `@optima/core/cards`), C (offers feed on `effectiveApy` + seed), G (planner on rules + offers).

## Open issues / decisions to review

- No Postgres here: Prisma code paths (admin writes, db:seed, ingest runner against a real DB) are unexercised.
- Card engine defaults: credit utilization 0 unless the user says otherwise; first-year view counts the
  sign-up bonus even when unreachable (flagged via feasibility). The UI must make both visible.
- Banking: deposits use compounded effective APY, bank bonuses use simple annualization; ranking sorts by
  net dollars first. Bonus "excess principal" earns the linked product rate or 0% (understates bonuses).
- Ingest: an unchanged rate does not bump lastVerifiedAt; adapters are opt-in.
- Schema suggestions (not applied): RateHistory tie-breaker index; Bank -> DepositProduct onDelete cascade;
  per-card cap groups instead of repeating cap on each rule.
