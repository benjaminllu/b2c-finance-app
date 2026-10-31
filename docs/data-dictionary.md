# Data dictionary

The source of truth is the Zod schemas in `packages/core/src/types/`. The Prisma schema in
`packages/db/prisma/schema.prisma` mirrors them; nested value objects are JSON columns that are parsed by
the same Zod schemas on read (`packages/db/src/mappers.ts`).

## Conventions

| Kind        | Representation                                    | Example                               |
| ----------- | ------------------------------------------------- | ------------------------------------- |
| Money       | Integer US cents (`*Cents`)                       | `9500` = $95.00                       |
| Rates       | Integer basis points (`*Bps`)                     | `425` = 4.25% APY                     |
| Earn rate   | Units of the card's reward currency per dollar    | `3` = 3x points, or 3% on a cash card |
| Point value | Cents per unit (`centsPerPoint`), a float         | `1.5`                                 |
| Dates       | `YYYY-MM-DD`                                      | `2027-03-31`                          |
| Timestamps  | ISO 8601 with offset                              | `2026-10-30T00:00:00Z`                |
| Ids         | Lowercase slugs, shared by seed JSON, DB and URLs | `sample-travel-card`                  |

Cash back is modelled as the `usd` reward currency worth 1 cent per unit, so a 2% card has
`baseMultiplier: 2`, and a $200 cash bonus is `amount: 20000` in `usd`.

The same company uses one id everywhere: `chase` is both an `Issuer` and a `Bank`, and
`BonusOffer.institutionId` / `AccountRecord.institutionId` / rule scopes refer to that id.

## Provenance (on cards, banks, deposit products, offers, rules)

| Field                         | Meaning                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sourceUrl`                   | Where a human verified the record. Required.                                                                                        |
| `lastVerifiedAt`              | When it was last verified. Drives staleness badges (`packages/core/src/staleness.ts`: offers 14 days, rates 7 days, cards 30 days). |
| `isSample`                    | Placeholder data. Any sample record shown triggers the site-wide sample-data banner.                                                |
| `affiliateUrl`, `isAffiliate` | Monetization only. **Ranking code must never read these.**                                                                          |

## Categories

Fixed canonical list: `groceries, dining, gas, travel, airfare, hotels, transit, streaming, drugstores,
online_retail, utilities, other`. `travel` means travel that is not airfare, hotels or transit (car
rental, cruises, etc.). `ISSUER_CATEGORY_MAP` maps issuer labels ("U.S. supermarkets", "Travel") onto one
or more canonical categories; a card's earn rules are always stored per canonical category.

## Entities

### Issuer

`id, name, website, isSample`.

### RewardCurrency

`id, name, issuerId | null, kind (cash|points|miles), defaultCentsPerPoint, valuationSource,
valuationSourceUrl | null, isSample`. The UI shows `valuationSource` next to the user's override input.

### CreditCard

| Field                                    | Notes                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `network`                                | visa, mastercard, amex, discover                                                                                                           |
| `productFamily`                          | Groups siblings for family-wide bonus rules; null if none                                                                                  |
| `annualFeeCents`, `firstYearFeeWaived`   |                                                                                                                                            |
| `rewardCurrencyId`                       |                                                                                                                                            |
| `baseMultiplier`                         | Earn rate for any category without an earn rule                                                                                            |
| `earnRules[]`                            | See EarnRule                                                                                                                               |
| `capGroups[]`                            | `{ id, capAmountCents, capPeriod }`: spend caps; see EarnRule                                                                              |
| `credits[]`                              | See CardCredit                                                                                                                             |
| `signupBonus`                            | `{ amount, currencyId, minSpendCents, windowDays }` or null                                                                                |
| `isBusiness`, `foreignTransactionFeeBps` |                                                                                                                                            |
| `imageUrl`                               | Card art: a site path under `apps/web/public` (e.g. `/cards/x.png`) or a URL you are licensed to use. null = generic card drawn by the UI. |

### EarnRule

| Field                        | Notes                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`, `multiplier`     |                                                                                                                                                                                                           |
| `capGroupId`                 | The card's `capGroups` entry this rule counts against; null = uncapped. Rules with the same id share one cap (e.g. a rotating 5% cap over two categories); the card fails validation if the id is missing |
| `afterCapMultiplier`         | Earn rate after the cap; null = `baseMultiplier`                                                                                                                                                          |
| `rotating`, `activeQuarters` | Rotating rules apply only in the listed quarters (1-4)                                                                                                                                                    |
| `portalOnly`                 | Only earned when booked through the issuer portal                                                                                                                                                         |

### CardCredit

`id, name, annualValueCents (face value if fully used), frequency
(monthly|quarterly|semiannual|annual|multi_year), usageConstraints`. User utilization is an input to the
math, never stored on the card.

### Bank

`id, name, kind (bank|credit_union), insurer (FDIC|NCUA), onlineOnly, membershipRequirement | null,
website` + provenance.

### DepositProduct

| Field                                                      | Notes                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `type`                                                     | checking, savings, money_market, cd                                                                              |
| `apyTiers[]`                                               | `{ minBalanceCents, maxBalanceCents                                                                              | null, apyBps }`, ascending |
| `tierMode`                                                 | `whole_balance`: the tier containing the balance applies to all of it. `blended`: each slice earns its own tier. |
| `compounding`                                              | daily or monthly                                                                                                 |
| `minOpenCents`, `minBalanceForApyCents`, `monthlyFeeCents` |                                                                                                                  |
| `feeWaivers[]`                                             | `{ kind, thresholdCents, count, description }`                                                                   |
| `cdTermMonths`, `earlyWithdrawalPenaltyDays`               | CDs only (penalty in days of interest)                                                                           |

DB only: `RateHistory` keeps one append-only row per rate change (`productId, apyTiers, recordedAt, source`).

### BonusOffer

| Field                                               | Notes                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| `productType`                                       | credit_card, checking, savings, money_market                                                                              |
| `institutionId`, `cardId`, `depositProductId`       | `cardId` is required for card offers                                                                                      |
| `bonusValue`, `bonusCurrencyId`                     | Cents when `usd`, else points/miles                                                                                       |
| `requirements`                                      | min spend + window; direct deposit total/count/window; min new deposit; min balance + holding period; free-text `other[]` |
| `monthlyFeeCents`, `monthlyFeeWaivedByRequirements` | For net-value math on deposit offers                                                                                      |
| `eligibility`                                       | `lifetimeLimit`, `lookbackMonths`, `lookbackScope (product                                                                | product_family | institution)`, `notes[]` |
| `eligibleStates`                                    | Two-letter codes, or null for nationwide (DB: empty array = nationwide)                                                   |
| `hardPull`                                          | Applying triggers a hard credit inquiry                                                                                   |
| `bonusPostingDays`                                  | Days after the requirements are met until the bonus posts; null = unknown                                                 |
| `earlyClosureFeeCents`, `earlyClosureWindowDays`    |                                                                                                                           |
| `expiresAt`                                         | null = no published end date. Expired offers are hidden.                                                                  |

### EligibilityRule (`data/seed/rules.json`)

Discriminated on `kind`; every rule has `id, name, description, appliesTo { institutionIds,
productTypes }` + provenance.

| Kind                    | Extra fields                                       | Example                                                |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------ | ----------------- | ------------------------- |
| `max_new_accounts`      | `count, windowMonths, countScope (all_institutions | same_institution), countedProductTypes, countBusiness` | "5/24"            |
| `min_days_between_apps` | `days`                                             | one application per 90 days                            |
| `lifetime_bonus`        | `productScope (product                             | product_family)`                                       | once per lifetime |
| `bonus_lookback`        | `months, productScope, measureFrom (bonus_received | account_opened                                         | account_closed)`  | no bonus within 24 months |
| `max_open_accounts`     | `count`                                            | at most 5 open cards with the issuer                   |

DB: kind-specific fields live in the `params` JSON column.

### SpendProfile

Monthly cents for every canonical category (all keys required). `emptySpendProfile()` builds a zeroed one.

### AccountRecord (user input; localStorage in v1)

`id, institutionId, productType, productId | null, productFamily | null, name, openedAt, closedAt | null,
isBusiness, bonusReceivedAt | null`. Never contains credentials.

### IngestRun (DB only)

One row per DataSource adapter run: `adapterId, startedAt, finishedAt, status, created, updated,
unchanged, error, log`.
