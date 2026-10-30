# Architecture

```
apps/web          Next.js App Router UI. Server components load data; client components run the math.
packages/core     Pure TypeScript domain logic + Zod schemas. No React, no DB, no Next (enforced by ESLint).
packages/db       Prisma schema, migrations, row <-> domain mappers, seed script.
packages/ui       shadcn/ui-style primitives plus StalenessBadge / SampleBadge.
data/seed         Versioned JSON seed files, parsed through the core schemas on import (@optima/seed).
```

## Data flow

1. `apps/web/lib/data/*.ts` are the only modules the UI uses to read data (server-only).
   - `DATABASE_URL` set: read Postgres via Prisma, map rows through the core schemas.
   - `DATABASE_URL` unset: return the validated seed JSON. This keeps `pnpm dev` working with no database.
2. Server components pass plain domain objects to client components.
3. Client components call pure `@optima/core` functions, so every calculation runs in the browser and is
   the same code the unit tests cover.
4. User inputs (spend profile, selected cards, valuations) live in the URL; personal records (account
   history, offer tracker) live in localStorage. Nothing personal is sent to the server in v1.

## Rules

- Money is integer cents and rates are basis points in core. Convert only for display (`apps/web/lib/format.ts`).
- Ranking never reads `affiliateUrl` or `isAffiliate`.
- Every curated record carries `sourceUrl`, `lastVerifiedAt`, and `isSample`.
- Eligibility rules are data (`rules.json`), not `if` statements.
- `/admin` and `/api/admin` are behind HTTP Basic auth (`ADMIN_PASSWORD`, `apps/web/middleware.ts`).
