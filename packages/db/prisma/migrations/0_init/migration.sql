-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Issuer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Issuer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardCurrency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuerId" TEXT,
    "kind" TEXT NOT NULL,
    "defaultCentsPerPoint" DOUBLE PRECISION NOT NULL,
    "valuationSource" TEXT NOT NULL,
    "valuationSourceUrl" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RewardCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "productFamily" TEXT,
    "annualFeeCents" INTEGER NOT NULL,
    "firstYearFeeWaived" BOOLEAN NOT NULL,
    "rewardCurrencyId" TEXT NOT NULL,
    "baseMultiplier" DOUBLE PRECISION NOT NULL,
    "earnRules" JSONB NOT NULL,
    "credits" JSONB NOT NULL,
    "signupBonus" JSONB,
    "isBusiness" BOOLEAN NOT NULL,
    "foreignTransactionFeeBps" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "affiliateUrl" TEXT,
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "onlineOnly" BOOLEAN NOT NULL,
    "membershipRequirement" TEXT,
    "website" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositProduct" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "apyTiers" JSONB NOT NULL,
    "tierMode" TEXT NOT NULL,
    "compounding" TEXT NOT NULL,
    "minOpenCents" INTEGER NOT NULL,
    "minBalanceForApyCents" INTEGER NOT NULL,
    "monthlyFeeCents" INTEGER NOT NULL,
    "feeWaivers" JSONB NOT NULL,
    "cdTermMonths" INTEGER,
    "earlyWithdrawalPenaltyDays" INTEGER,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "affiliateUrl" TEXT,
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "apyTiers" JSONB NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "RateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusOffer" (
    "id" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "cardId" TEXT,
    "depositProductId" TEXT,
    "title" TEXT NOT NULL,
    "bonusValue" INTEGER NOT NULL,
    "bonusCurrencyId" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "monthlyFeeCents" INTEGER NOT NULL,
    "monthlyFeeWaivedByRequirements" BOOLEAN NOT NULL,
    "eligibility" JSONB NOT NULL,
    "eligibleStates" TEXT[],
    "earlyClosureFeeCents" INTEGER NOT NULL,
    "earlyClosureWindowDays" INTEGER,
    "expiresAt" DATE,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "affiliateUrl" TEXT,
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityRule" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appliesTo" JSONB NOT NULL,
    "params" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EligibilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "log" JSONB,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCard_issuerId_idx" ON "CreditCard"("issuerId");

-- CreateIndex
CREATE INDEX "DepositProduct_bankId_idx" ON "DepositProduct"("bankId");

-- CreateIndex
CREATE INDEX "DepositProduct_type_idx" ON "DepositProduct"("type");

-- CreateIndex
CREATE INDEX "RateHistory_productId_recordedAt_idx" ON "RateHistory"("productId", "recordedAt");

-- CreateIndex
CREATE INDEX "BonusOffer_productType_expiresAt_idx" ON "BonusOffer"("productType", "expiresAt");

-- CreateIndex
CREATE INDEX "BonusOffer_institutionId_idx" ON "BonusOffer"("institutionId");

-- CreateIndex
CREATE INDEX "IngestRun_adapterId_startedAt_idx" ON "IngestRun"("adapterId", "startedAt");

-- AddForeignKey
ALTER TABLE "RewardCurrency" ADD CONSTRAINT "RewardCurrency_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_rewardCurrencyId_fkey" FOREIGN KEY ("rewardCurrencyId") REFERENCES "RewardCurrency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositProduct" ADD CONSTRAINT "DepositProduct_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateHistory" ADD CONSTRAINT "RateHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DepositProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

