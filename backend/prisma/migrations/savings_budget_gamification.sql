-- Migration: savings_budget_gamification
--
-- Adds the SAVINGS_TARGET challenge type and the Challenge.target_amount column
-- that back the savings/budget-period gamification feature.
--
-- This project applies schema changes with `npx prisma db push` (there is no
-- prisma migrations history / migration_lock.toml), so this file documents the
-- exact DDL for reproducibility. Both statements are additive and safe on
-- existing rows:
--   * the enum value is appended (no reordering);
--   * target_amount is nullable and defaults NULL for every existing challenge.
--
-- To apply:  npx prisma db push   (then  npx prisma generate)

-- 1) Append the new challenge type to the existing enum (additive, non-breaking).
ALTER TYPE "ChallengeType" ADD VALUE IF NOT EXISTS 'SAVINGS_TARGET';

-- 2) Add the nullable target amount column (Decimal(10,2), NULL for existing rows).
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "target_amount" DECIMAL(10, 2);
