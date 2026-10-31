# Optima

A decision engine for credit cards, bank bonuses, and deposit accounts that shows its math. Every result
explains why one option wins.

- **Cards** (`/cards`): compare 2 to 4 cards on your spending, with break-even points, credit-use reality
  check, point valuations, sensitivity, and best-wallet routing.
- **Offers** (`/offers`): card and bank sign-up bonuses valued net of fees, with eligibility flags and a
  personal tracker.
- **Banking** (`/banking`): savings, money market, checking, CDs, and bank bonuses ranked on one scale for
  your amount and lock-up period.
- **Planner** (`/planner`): a 12 or 24 month plan of what to open and when, respecting issuer rules and your
  spend, direct deposit, and hard-pull limits.

> All data in `data/seed` is **sample data** (`isSample: true`). The site shows a sample-data banner until
> real, verified data replaces it. Nothing here is financial advice.

## Quick start

Requirements: Node 20+, pnpm 9.

```sh
pnpm install
pnpm dev            # http://localhost:3000, reads data/seed (no database needed)
```

With Postgres (optional; needed for `/admin` edits and the ingestion cron):

```sh
cp .env.example .env          # set DATABASE_URL, ADMIN_PASSWORD, CRON_SECRET
pnpm db:up                    # docker compose Postgres on :5432
pnpm db:migrate               # apply packages/db/prisma/migrations
pnpm db:seed                  # idempotent; safe to re-run
pnpm dev
```

Each package reads `.env` from its own folder: copy the file into `packages/db` (migrate, seed) and `apps/web`
(Next.js) too, or export the variables in your shell.

## Commands

| Command                                       | What it does                                                    |
| --------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                    | Next.js dev server                                              |
| `pnpm test`                                   | Vitest across all packages                                      |
| `pnpm e2e`                                    | Playwright smoke test (Chromium)                                |
| `pnpm lint` / `pnpm typecheck`                | ESLint / `tsc --noEmit` in every package                        |
| `pnpm seed:validate`                          | Validate seed JSON against the Zod schemas and cross-references |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Prisma client, migrations, seed                                 |

## Architecture

```
apps/web          Next.js App Router. Server components load data; client components run core math.
packages/core     Pure TypeScript domain logic + Zod schemas (no React/DB). Subpath exports:
                  @optima/core (types, staleness), /cards, /banking, /offers, /planner, /eligibility, /ingest
packages/db       Prisma schema + migrations, row<->domain mappers, seed, ingest runner, admin writes
packages/ui       shadcn/ui-style primitives, StalenessBadge, SampleBadge
data/seed         Versioned JSON seed (@optima/seed), parsed through the core schemas on import
docs              architecture, data dictionary, data sources, progress, roadmap, quality report
```

- Money is integer cents and rates are basis points everywhere in core; formatting happens only in
  `apps/web/lib/format.ts`.
- Without `DATABASE_URL`, `apps/web/lib/data/*` serve the seed JSON; with it, Prisma.
- User inputs live in the URL (shareable); account history and the offer tracker live in localStorage. No
  accounts, no credentials, nothing personal on the server.
- Rankings never read `affiliateUrl` / `isAffiliate`.
- Eligibility rules are data (`data/seed/rules.json`) evaluated by `@optima/core/eligibility`.

More: [docs/architecture.md](docs/architecture.md), [docs/data-dictionary.md](docs/data-dictionary.md).

## Adding or updating data

- **By hand (v1):** edit `data/seed/*.json`, run `pnpm seed:validate`, then `pnpm db:seed` if you use a
  database. Every record needs `sourceUrl`, `lastVerifiedAt`, and `isSample` (set `false` only after a human
  verified it against the source). Staleness badges appear after 14 days for offers, 7 for rates, 30 for cards.
- **Admin UI:** `/admin/offers` and `/admin/banking` (HTTP Basic auth, password `ADMIN_PASSWORD`, needs a
  database). "Mark verified" stamps `lastVerifiedAt`; rate changes append to `RateHistory`.
- **Automated sources:** implement a `DataSource` adapter, register it, and enable it with
  `INGEST_ADAPTERS`. Read [docs/data-sources.md](docs/data-sources.md) first, including the legal checklist.
  No scrapers.

## Deploying

Vercel for `apps/web` (root directory `apps/web`, install command `pnpm install`), a managed Postgres (Neon or
Supabase) for `DATABASE_URL`, plus `ADMIN_PASSWORD` and `CRON_SECRET`. `apps/web/vercel.json` schedules the
ingestion cron daily. Run `pnpm db:migrate` against the production database before the first deploy.
