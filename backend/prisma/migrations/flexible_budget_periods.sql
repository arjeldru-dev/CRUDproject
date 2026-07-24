-- Migration: flexible_budget_periods
--
-- Adds the per-category budget-period configuration that powers the Flexible
-- Budget Periods feature: the BudgetPeriod enum plus the five period columns on
-- the `categories` table (period, monthly_start_day, weekly_start_day,
-- custom_period_days, anchor_date).
--
-- This project applies schema changes with `npx prisma db push` (there is no
-- prisma migrations history / migration_lock.toml), so this file documents the
-- exact DDL for reproducibility. Every statement is additive and safe on
-- existing rows:
--   * the enum is created only if absent (no reordering of values);
--   * `period` is NOT NULL with DEFAULT 'MONTHLY', so existing categories keep
--     the classic calendar-month behavior;
--   * the four tuning columns are nullable and default NULL, matching the
--     "NULL/1 = calendar month" convention the period engine expects.
--
-- To apply:  npx prisma db push   (then  npx prisma generate)

-- 1) Create the budget-period enum if it does not already exist.
--    (CREATE TYPE has no IF NOT EXISTS, so guard it with a DO block.)
DO $$ BEGIN
  CREATE TYPE "BudgetPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add the period configuration columns (all additive, idempotent).
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "monthly_start_day" INTEGER,   -- 1–31 (clamped), or -1 = "last day of month"; NULL/1 = calendar month
  ADD COLUMN IF NOT EXISTS "weekly_start_day" INTEGER,    -- 0=Sunday … 6=Saturday; required when period=WEEKLY
  ADD COLUMN IF NOT EXISTS "custom_period_days" INTEGER,  -- cycle length in days; required when period=CUSTOM
  ADD COLUMN IF NOT EXISTS "anchor_date" DATE;            -- reference start date for CUSTOM cycles
