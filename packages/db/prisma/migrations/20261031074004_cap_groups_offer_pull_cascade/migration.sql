-- Deleting a bank now deletes its products (and, already, their RateHistory).
ALTER TABLE "DepositProduct" DROP CONSTRAINT "DepositProduct_bankId_fkey";
ALTER TABLE "DepositProduct" ADD CONSTRAINT "DepositProduct_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RateHistory: id breaks ties between rows recorded at the same instant.
DROP INDEX "RateHistory_productId_recordedAt_idx";
CREATE INDEX "RateHistory_productId_recordedAt_id_idx" ON "RateHistory"("productId", "recordedAt", "id");

-- BonusOffer: existing rows keep the old planner assumption (cards are hard pulls, bank accounts soft);
-- posting delay is unknown.
ALTER TABLE "BonusOffer" ADD COLUMN "bonusPostingDays" INTEGER,
ADD COLUMN "hardPull" BOOLEAN NOT NULL DEFAULT false;
UPDATE "BonusOffer" SET "hardPull" = ("productType" = 'credit_card');
ALTER TABLE "BonusOffer" ALTER COLUMN "hardPull" DROP DEFAULT;

-- CreditCard: caps move from each earn rule to card-level capGroups. A rule's group is its old capGroup,
-- or (uncapped by group) one of its own named after its category, so every cap means what it did before.
ALTER TABLE "CreditCard" ADD COLUMN "capGroups" JSONB NOT NULL DEFAULT '[]';
UPDATE "CreditCard" c SET
  "capGroups" = COALESCE((
    SELECT jsonb_agg(g ORDER BY ord)
    FROM (
      -- One group per id, in order of first use.
      SELECT DISTINCT ON (gid) gid, ord,
        jsonb_build_object('id', gid, 'capAmountCents', r->'capAmountCents', 'capPeriod', r->'capPeriod') AS g
      FROM jsonb_array_elements(c."earnRules") WITH ORDINALITY AS e(r, ord),
        LATERAL (SELECT COALESCE(r->>'capGroup', replace(r->>'category', '_', '-')) AS gid) AS k
      WHERE r->'capAmountCents' <> 'null'::jsonb
      ORDER BY gid, ord
    ) AS groups
  ), '[]'::jsonb),
  "earnRules" = COALESCE((
    SELECT jsonb_agg(
      (r - 'capAmountCents' - 'capPeriod' - 'capGroup') || jsonb_build_object('capGroupId',
        CASE WHEN r->'capAmountCents' = 'null'::jsonb THEN 'null'::jsonb
             ELSE to_jsonb(COALESCE(r->>'capGroup', replace(r->>'category', '_', '-'))) END)
      ORDER BY ord)
    FROM jsonb_array_elements(c."earnRules") WITH ORDINALITY AS e(r, ord)
  ), '[]'::jsonb);
ALTER TABLE "CreditCard" ALTER COLUMN "capGroups" DROP DEFAULT;
