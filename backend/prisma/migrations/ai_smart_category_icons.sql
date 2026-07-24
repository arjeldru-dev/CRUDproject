-- Migration: ai_smart_category_icons
--
-- Adds the AI Smart Category Icon field that powers the LLM-Powered Insights &
-- Smart Category Icons feature: a single nullable `icon_key` column on the
-- `categories` table. The classifier writes one value from the closed ICON_KEYS
-- set at category create / name-change time; the frontend renders it to a Lucide
-- component and falls back to its keyword heuristic when the column is NULL.
--
-- This project applies schema changes with `npx prisma db push` (there is no
-- prisma migrations history / migration_lock.toml), so this file documents the
-- exact DDL for reproducibility. The statement is additive and safe on existing
-- rows: the column is nullable with no default, so every existing category keeps
-- `icon_key = NULL` and renders via the heuristic until it is next renamed
-- (or backfilled via the optional /api/categories/reclassify-icons endpoint).
--
-- To apply:  npx prisma db push   (then  npx prisma generate)

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "icon_key" TEXT;  -- one of ICON_KEYS, or NULL = fall back to keyword heuristic
