# Quality and compliance report (Agent F)

Date of run: 2026-10-30. All data is sample data.

## Command results

| Command              | Result                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | pass, no warnings                                                                                         |
| `pnpm typecheck`     | pass (web now also typechecks `e2e/` via `e2e/tsconfig.json`)                                             |
| `pnpm test`          | pass: core 99, db 5, web 6                                                                                |
| `pnpm seed:validate` | pass (6 issuers, 7 currencies, 15 cards, 13 banks, 20 products, 14 offers, 14 rules, cross-references ok) |

## E2E (Playwright, Chromium, `pnpm e2e` or `pnpm --filter @optima/web e2e`)

- `e2e/smoke.spec.ts`: 12 tests, all pass. Covers heading, sample banner, advertiser disclosure, "Not financial advice" and
  no console or page errors on `/ /cards /offers /banking /planner`; a card comparison (first-year toggle, spend edit, URL
  updates); shared-URL restore; one interaction each on offers, banking, planner; `/admin` with credentials shows the
  no-database warning; `/admin` without credentials returns 401.
- `e2e/a11y.spec.ts`: 22 tests, all pass in the final run. axe (wcag2a/aa, serious+critical) clean on all 5 public pages; Tab
  order lands only on controls; sortable headers and tab lists work by keyboard; every input has an accessible name; no
  horizontal scroll at 375px; Stale badges appear for the old seed records; offers link their source; no non-GET requests
  while using the app; no password inputs.
- No test is marked `fail`/`fixme`: no app bug blocked a step.
- Environment caveat: on this machine `playwright install chromium` did not finish fetching the build pinned by 1.55.1
  (revision 1193; the download repeatedly stalled). The runs above used a locally installed newer headless shell through
  `PW_CHROMIUM_PATH` (supported in `playwright.config.ts`). On a normal machine, run
  `pnpm --filter @optima/web exec playwright install chromium` and leave `PW_CHROMIUM_PATH` unset.
- Test config reuses an existing server on port 3105, else starts `next dev` with `ADMIN_PASSWORD=test`.

## Findings

### Blocker

None found.

### Should-fix

1. **Two money-value functions are still duplicated.** `packages/core/src/offers/net-value.ts:49` (floors months open,
   `Math.floor(keepDays / DAYS_PER_MONTH)`) vs `packages/core/src/planner/value.ts:21-67` (`Math.ceil`, plus a keep-vs-close
   choice). They agree on all 14 seed offers (probed), but will disagree for e.g. a $15/month unwaived fee with a 91-day
   hold (floor = 2 months, ceil = 4). Reproduce: call both with a bank offer with `monthlyFeeCents=1500`,
   `monthlyFeeWaivedByRequirements=false`, `holdingPeriodDays=91`. Fix: have the planner call `offerNetValue`, settle one month rule.
2. **Duplicate sample-data warnings.** The site banner (`apps/web/components/site-chrome.tsx:5`) already appears on every
   page, and then `/planner` adds a second "Sample data, not financial advice" alert
   (`apps/web/components/planner/planner-explorer.tsx:181`), `/cards` (`apps/web/app/cards/page.tsx:22`) and `/banking`
   (`apps/web/app/banking/page.tsx:25`) add their own "Showing sample seed data" notes. Fix: keep the banner, drop the page-level
   duplicates (keep the planner's "opening accounts affects your credit" sentence only).
3. **Planner shows no staleness or source per step.** `apps/web/components/planner/plan-timeline.tsx` renders steps from
   offers with `lastVerifiedAt` of 2026-08-15 (e.g. `delta-skymiles-gold-amex-signup`) with no StalenessBadge and no
   source link, so a stale offer can be recommended without the warning the other pages show. Fix: add StalenessBadge
   (kind `offers`) and `sourceUrl` to each step and to skipped-offer rows.

### Nice-to-have

4. **`TableHead` lacks `scope="col"`** (`packages/ui/src/primitives.tsx:93`). Browsers infer columnheader, but
   Playwright's role engine (and some AT heuristics) treat scope-less `th` as a plain cell:
   `getByRole("columnheader", {name: /^APY/})` finds nothing on `/banking`. Fix: default `scope="col"` in `TableHead`.
5. **Stale rule at the boundary:** `2026-10-01` records show "Stale: verified 29d ago" for rates (7d threshold) but cards
   dated 2026-10-01 would not be stale (30d threshold). That is per the thresholds, just worth knowing when seeding dates.
6. **`effectiveApy` with a tiny principal:** `packages/core/src/banking/effective-apy.ts:~140`. With a monthly-fee account and
   $0.01 deposit (`minOpenCents=0`) the result is feasible with `effectiveApyBps = -10000` and net -1 cent (fee is clamped
   to the balance). Harmless but a "-100% APY" line looks odd. Fix: mark infeasible below a sensible principal or show "n/a".
7. **`buildCdLadder` with `rungs = 0`** divides by zero (`cd.ts:~141`, `Math.floor(amountCents / n)`). The UI clamps rungs to
   1..10 (`ladder-builder.tsx:42`), so only a direct core caller can hit it. Fix: guard `n < 1`.
8. **Playwright artifacts not ignored?** `eslint.config.js` ignores `test-results` and `playwright-report`; confirm root
   `.gitignore` does too (not checked, outside my ownership).
9. **Admin pages call `StalenessBadge` without `now`** (`apps/web/app/admin/*/page.tsx`), fine as server components; if any
   of them becomes a client component, `new Date()` will risk hydration mismatches.

## Money math review

Read `cards/engine.ts`, `breakeven.ts`, `extras.ts`, `banking/{effective-apy,interest,cd,rank}.ts`,
`offers/{net-value,parked-cash}.ts`, `planner/{planner,value}.ts`. Rounding discipline is good: raw floats stay internal,
`roundValue` rounds each line once and totals are sums of the rounded lines; banking breakdown lines are rounded once each
and `netEarningsCents` is their sum; `toFixed` is used only in display strings (percent text).

Throwaway probe (deleted afterwards) ran over all 15 seed cards + flat baseline, 4 spend profiles (zero, small, large, mixed),
ongoing and first-year views with point-value overrides; all 20 products x 14 offers x 6 amounts (0 to $1.2M) x 8 horizons
(1 to 1000 days); parked-cash comparison; CD ladders with 0, 1, 3, 7 rungs; and three planner capacity sets. Checks:
every `*Cents`/`*Bps`/`points` field is an integer and finite; card total equals rewards + credits + bonus - fee; rewards
equal the sum of category lines; banking net equals the sum of breakdown lines; ladder amounts sum to the input; planner
`totalNetCents` equals the sum of step nets and the last month's cumulative. Result: no violations (only findings 1, 6, 7 above).
Planner `monthlyCents` per load is `Math.round(total/months)` for display while fit checks use the exact value
(`planner.ts:233, 244`), which is intentional but means displayed monthly loads can differ by up to 1 cent per window from total/months.

## Accessibility

- axe wcag2a/aa: no serious or critical violations on `/ /cards /offers /banking /planner`.
- Labels: every input/select/textarea on the five pages has a label or aria-label (tested).
- Keyboard: Tab order reaches only real controls; skip link exists; banking column sort buttons work with Enter and expose
  `aria-sort`; offers tabs move with arrow keys.
- Color is not the only signal: Stale badges say "Stale: ..." in text; winner has a "Winner" badge; sort direction is in
  the button text; infeasible bonuses are flagged in text.
- Chart color contrast against the page background (computed, WCAG relative luminance):

  | Token              | Light | Dark  |
  | ------------------ | ----- | ----- |
  | `--chart-1`        | 5.17  | 7.52  |
  | `--chart-2`        | 3.19  | 11.46 |
  | `--chart-3`        | 3.77  | 9.95  |
  | `--chart-4`        | 5.38  | 7.24  |
  | `--chart-baseline` | 4.83  | 7.53  |

  All at or above 3:1. `--chart-2` in light mode (3.19) is the closest to the limit. Text: muted-foreground 6.54 on
  background and 5.82 on muted (light), 7.71 / 6.45 (dark); warning text on warning fill 8.69 (light).

- Not verified: dark-mode screenshots, screen-reader announcements for charts (they have `role="img"` plus a table).

## Compliance

- Advertiser disclosure and "Not financial advice" are in `DisclosureFooter` on every page (asserted on all five public pages).
- Sample-data banner appears on every page while any record is sample (all are).
- StalenessBadge appears on cards (compare columns), offers, deposit tables and cash-ranking rows. Seed records dated
  2026-08-15 and 2026-10-01 render as "Stale: verified 76d ago" / "29d ago" (asserted). Planner lacks it (finding 3).
- Offers link `sourceUrl` (`offer-card.tsx:295`, asserted). Cards show the valuation source link.
- Ranking never reads `affiliateUrl`/`isAffiliate`: grep shows they appear only in schema (`types/*`), the flat-baseline
  card constants (`cards/extras.ts:35`, `fixtures.ts:61`, both null/false), admin forms and a display "Affiliate link" badge
  (`offer-card.tsx:212`); core sort/filter/rank/planner code does not reference them.
- No password or credential inputs on public pages (asserted); footer copy says Optima never asks for logins.
- Privacy: only `localStorage` is used (`lib/account-history.ts`, `offers/use-tracker.ts`); no `fetch`/beacon in web code
  other than server actions in admin; the e2e test saw no non-GET requests during public-page use.

## Not checked

Prisma/admin write paths (no Postgres); real-device mobile (only 375px emulation, overflow checked, full-page screenshots
were too tall to judge visually); dark mode visuals; production build (`next build`) behavior; Firefox/WebKit.
