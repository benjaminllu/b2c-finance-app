# Progress

Resume rule: read this file and `git log`, continue from the last completed checkpoint, do not redo finished waves.

## Status

- [x] Phase 0: foundation (monorepo, shared types, Prisma schema, app shell). Commit: "foundation".
- [ ] Wave 1: Agent A (card math), Agent D (banking + effectiveApy), Agent E (seed data, db seed, ingest).
- [ ] Wave 1 checkpoint. Commit: "wave 1 complete".
- [ ] Wave 2: Agent B (card UI), Agent C (offers), Agent G (planner).
- [ ] Wave 2 checkpoint. Commit: "wave 2 complete".
- [ ] Agent F: quality and compliance pass.
- [ ] Phase 2: integration, README, roadmap.

## Environment notes

- No Docker on the dev machine, so Postgres has not been exercised locally. The app falls back to seed JSON
  when `DATABASE_URL` is unset. The initial migration was generated offline with `prisma migrate diff`.
- pnpm 9.15.9 installed globally via npm (corepack could not write to Program Files).

## Open issues

- None yet.
