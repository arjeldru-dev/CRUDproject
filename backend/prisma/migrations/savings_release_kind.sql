-- Migration: savings_release_kind
--
-- Adds the SavingsUsageKind enum and the SavingsUsage.kind discriminator that
-- back the "Move savings to budget" (release-to-budget) feature. A RELEASE usage
-- credits the category's current-period budget (a negative BUDGET_DEDUCTION on a
-- TOP_UP transaction) and is added back into that period's accrual once the
-- period closes, so unspent released money returns to savings; a SPEND usage is
-- the legacy direct-spend offset.
--
-- This project applies schema changes with `npx prisma db push` (there is no
-- prisma migrations history / migration_lock.toml), so this file documents the
-- exact DDL for reproducibility. Both statements are additive and backfill-safe:
--   * the enum is created only if absent;
--   * the column is nullable-free with a DEFAULT 'SPEND', so every existing
--     SavingsUsage row is backfilled to 'SPEND' (legacy offset semantics) and no
--     historical savings figure changes.
--
-- To apply:  npx prisma db push   (then  npx prisma generate)

-- 1) Create the discriminator enum (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SavingsUsageKind') THEN
    CREATE TYPE "SavingsUsageKind" AS ENUM ('SPEND', 'RELEASE');
  END IF;
END
$$;

-- 2) Add the kind column defaulting to SPEND; existing rows backfill to SPEND.
ALTER TABLE "savings_usages"
  ADD COLUMN IF NOT EXISTS "kind" "SavingsUsageKind" NOT NULL DEFAULT 'SPEND';
