# Data sources and ingestion

Curated data (cards, offers, deposit products, rules) lives in `data/seed/*.json` and is loaded with
`pnpm db:seed`. Every seed record is a **sample placeholder** (`isSample: true`) until a human verifies it.
Automated sources feed the same tables through the ingestion framework described here.

## How it fits together

| Piece                                      | Where                                             | Job                                                                 |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------- |
| `DataSource` interface, `diffRecords`, CSV | `packages/core/src/ingest` (pure)                 | Fetch raw records, normalize with the core Zod schemas, diff        |
| `runIngest`, `createPrismaStore`, registry | `packages/db/src`                                 | Fetch, normalize, diff against the DB, write, record an `IngestRun` |
| Cron entry point                           | `apps/web/app/api/cron/ingest/route.ts`           | Daily run of the enabled adapters (`apps/web/vercel.json`)          |
| Example adapter                            | `csvRatesSource` + `data/ingest/sample-rates.csv` | Reads a CSV of APY tiers and produces rate updates                  |

Adapters never touch the database and never throw for bad data: `normalize` returns
`{ records, errors }`, with one error per bad record. The runner writes only what changed. It never deletes.
Rate changes append a `RateHistory` row whose `source` is the adapter id.

## Adding an affiliate feed or rate API adapter

1. **Clear the legal checklist below first.** Do not write code for a source you may not use.
2. **Pick the kind.** `cards`, `offers`, `deposit_products` (full records) or `rates` (APY tiers for products
   that already exist). Rate feeds update existing products; they cannot create them.
3. **Write the adapter** in `packages/core/src/ingest/` (or a new file there). Implement `DataSource`:
   - `id`: stable and unique, for example `acme-rate-api`. It becomes `RateHistory.source` and `IngestRun.adapterId`.
   - `fetch()`: return raw records. Keep network and file access injectable (see `csvRatesSource({ read })`) so
     tests run offline. Respect the rate limits and send an honest `User-Agent`.
   - `normalize(raw)`: map each raw record to the domain type and validate it with the core Zod schema
     (`CreditCardSchema`, `BonusOfferSchema`, `DepositProductSchema`, `RateUpdateSchema`). Convert units here:
     dollars to integer cents, percent to basis points, provider category names through `mapIssuerCategory`.
     Return a per-record error instead of throwing.
   - Set `sourceUrl` to the page or endpoint the data came from and `lastVerifiedAt` to when the **source** says
     the data was true (for rates, `observedAt`), not to "now" unless the fetch itself is the observation.
   - Set `isSample: false` only for records a source actually supplied. Never copy a seed record's flags over.
4. **Unit-test it** against fixture data: a good record, a malformed record, and a re-run that yields no changes
   (see `packages/core/src/ingest/ingest.test.ts` and `packages/db/src/seed-ingest.test.ts`).
5. **Register it** in `ALL_ADAPTERS` in `packages/db/src/adapters.ts`. Registering does not enable it.
6. **Enable it deliberately.** The cron route runs only adapters whose id appears in the `INGEST_ADAPTERS`
   environment variable (comma separated). Also set `CRON_SECRET`, and any API keys, in the deployment.
7. **Watch the first runs.** Check the `IngestRun` rows (`status`, counts, `error`, `log`) before trusting the data.
   A run is `failed` when the fetch throws or every record is invalid.
8. **Run it by hand** with `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/ingest`.

Affiliate feeds additionally carry `affiliateUrl` and `isAffiliate`. Ranking never reads these fields, so a
feed must not be able to change an offer's position.

## Legal checklist before enabling any automated source

- [ ] **Terms of service.** Read them. Automated access, redistribution and display of the data must be allowed
      in writing. If the terms are unclear, ask the provider; do not assume.
- [ ] **robots.txt.** Check it for any web endpoint. Disallowed paths are off limits. We do not build scrapers;
      use official feeds and APIs.
- [ ] **Attribution.** Note any required credit, logo or link text and add it where the data is shown.
- [ ] **Rate limits.** Stay well inside published limits. The cron runs once a day; do not add retries that
      multiply requests.
- [ ] **Data licensing.** Confirm we may store, transform and show the data to the public, and for how long.
      Check whether competitor comparison or caching is restricted.
- [ ] **Credentials.** API keys live in environment variables, never in the repo or in `sourceUrl`.
- [ ] **Honest provenance.** `sourceUrl` must point to the real origin. `lastVerifiedAt` records when the data
      was last true according to the source; a successful fetch of a stale feed is not a fresh verification.
- [ ] **Never present unverified data as current.** Records from a source nobody has reviewed keep
      `isSample: true` (shown with the sample badge). Staleness badges (`STALENESS_THRESHOLD_DAYS`) must keep
      working, so do not bump `lastVerifiedAt` on records the source did not confirm.
- [ ] **Failure mode.** If the source goes away or returns garbage, the run fails visibly and existing data is
      left in place; it ages into a staleness badge rather than being deleted or faked.

## The sample CSV adapter

`sample-rates-csv` reads `data/ingest/sample-rates.csv`. The file is invented sample data. It exists to exercise
the pipeline and is not enabled by default. To try it against a seeded database:

```
INGEST_ADAPTERS=sample-rates-csv CRON_SECRET=dev DATABASE_URL=... pnpm dev
curl -H "Authorization: Bearer dev" http://localhost:3000/api/cron/ingest
```

The adapter resolves the CSV from `../../data/ingest/sample-rates.csv` relative to the working directory
(`apps/web`), or from `INGEST_SAMPLE_RATES_PATH`. On Vercel the file must be included in the function bundle
(`outputFileTracingIncludes` in `next.config.ts`); real adapters should fetch over HTTP instead.
