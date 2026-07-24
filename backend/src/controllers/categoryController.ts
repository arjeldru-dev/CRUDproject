import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import {
  BUDGET_PERIODS,
  type BudgetPeriod,
  type PeriodSource,
  ValidationError,
  isBudgetPeriod,
  normalizePeriodConfig,
  validateLimitAmount,
  validateName,
} from '../services/categoryValidationService';
import { classifyIcon } from '../services/aiIconService';
import { feedService } from '../services/feedService';

/**
 * Reject a name that collides (case-insensitively) with another of the user's
 * categories. `excludeId` skips the row being renamed so a no-op rename passes.
 * Throws ValidationError-style 409 via the returned message.
 */
async function assertNameAvailable(userId: string, name: string, excludeId?: string): Promise<boolean> {
  const clash = await prisma.category.findFirst({
    where: {
      userId,
      name: { equals: name, mode: Prisma.QueryMode.insensitive },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return clash === null;
}

/**
 * True when an error is the Postgres unique-violation (P2002) from the
 * (user_id, name) index — the atomic backstop for a write race that slips past
 * `assertNameAvailable`.
 */
export function isUniqueNameViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * POST /api/categories
 * Creates a new budget category for the authenticated user.
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, limitAmount, period } = req.body;

    if (name === undefined || name === null || limitAmount === undefined || limitAmount === null) {
      return res.status(400).json({ error: 'Name and limitAmount are required' });
    }

    const normalizedName = validateName(name);
    const normalizedLimit = validateLimitAmount(limitAmount);

    const effectivePeriod: BudgetPeriod = period ?? 'MONTHLY';
    if (!isBudgetPeriod(effectivePeriod)) {
      return res.status(400).json({ error: `period must be one of: ${BUDGET_PERIODS.join(', ')}` });
    }

    const config = normalizePeriodConfig(effectivePeriod, req.body);

    if (!(await assertNameAvailable(req.user.id, normalizedName))) {
      return res.status(409).json({ error: `A category named "${normalizedName}" already exists.` });
    }

    // Best-effort AI icon classification (server-owned; never read from the
    // client). A failure/timeout returns null → the row is still created and the
    // frontend falls back to its keyword heuristic. Runs only after the name is
    // known-available so classify never precedes a validation/uniqueness reject.
    const iconKey = await classifyIcon(normalizedName);

    const category = await prisma.category.create({
      data: {
        name: normalizedName,
        limitAmount: normalizedLimit,
        userId: req.user.id,
        iconKey,
        ...config,
      },
    });

    return res.status(201).json({ category });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (isUniqueNameViolation(error)) {
      return res.status(409).json({ error: 'A category with that name already exists.' });
    }
    console.error('Create category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/categories
 * Retrieves all categories belonging to the authenticated user.
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const PERIOD_PARAM_KEYS = ['period', 'monthlyStartDay', 'weeklyStartDay', 'customPeriodDays', 'anchorDate'];

/**
 * PATCH /api/categories/:id
 * Updates a category's name, limit, or period configuration after verifying
 * ownership. Returns 404 if not found, 403 if it belongs to another user.
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, limitAmount } = req.body;
    const touchesName = name !== undefined && name !== null;
    const touchesLimit = limitAmount !== undefined && limitAmount !== null;
    const touchesPeriod = PERIOD_PARAM_KEYS.some((k) => k in req.body);

    if (!touchesName && !touchesLimit && !touchesPeriod) {
      return res.status(400).json({ error: 'At least one field (name, limitAmount, or period config) is required' });
    }

    const normalizedName = touchesName ? validateName(name) : undefined;
    const normalizedLimit = touchesLimit ? validateLimitAmount(limitAmount) : undefined;

    const existingCategory = await prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (existingCategory.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this category' });
    }

    if (normalizedName !== undefined && !(await assertNameAvailable(req.user.id, normalizedName, id))) {
      return res.status(409).json({ error: `A category named "${normalizedName}" already exists.` });
    }

    const updateData: Record<string, unknown> = {};
    if (normalizedName !== undefined) updateData.name = normalizedName;
    if (normalizedLimit !== undefined) updateData.limitAmount = normalizedLimit;

    // Re-classify the icon ONLY when the name actually changes. Limit-only or
    // period-only edits leave iconKey untouched (no LLM call). Best-effort:
    // a null result is written so a name that no longer matches its old icon
    // reverts to the heuristic rather than keeping a stale AI icon.
    if (normalizedName !== undefined) {
      updateData.iconKey = await classifyIcon(normalizedName);
    }

    if (touchesPeriod) {
      const effectivePeriod: BudgetPeriod = (req.body.period ?? existingCategory.period) as BudgetPeriod;
      if (!isBudgetPeriod(effectivePeriod)) {
        return res.status(400).json({ error: `period must be one of: ${BUDGET_PERIODS.join(', ')}` });
      }
      // Merge incoming params over the existing row so unchanged params are preserved.
      const merged: PeriodSource = {
        monthlyStartDay: 'monthlyStartDay' in req.body ? req.body.monthlyStartDay : existingCategory.monthlyStartDay,
        weeklyStartDay: 'weeklyStartDay' in req.body ? req.body.weeklyStartDay : existingCategory.weeklyStartDay,
        customPeriodDays: 'customPeriodDays' in req.body ? req.body.customPeriodDays : existingCategory.customPeriodDays,
        anchorDate: 'anchorDate' in req.body ? req.body.anchorDate : existingCategory.anchorDate,
      };
      Object.assign(updateData, normalizePeriodConfig(effectivePeriod, merged));
    }

    // When the name actually changes, propagate it into the frozen name
    // snapshots on existing feed posts so the rename shows everywhere — not just
    // on surfaces that resolve the name live by categoryId. Done atomically with
    // the category update so a failure can't leave a half-renamed state.
    const oldName = existingCategory.name;

    const updatedCategory = await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id },
        data: updateData,
      });
      if (normalizedName !== undefined && normalizedName !== oldName) {
        await feedService.renameCategoryInPosts(tx, req.user.id, oldName, normalizedName);
      }
      return category;
    });

    return res.status(200).json({ category: updatedCategory });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (isUniqueNameViolation(error)) {
      return res.status(409).json({ error: 'A category with that name already exists.' });
    }
    console.error('Update category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/categories/:id
 * Deletes a category belonging to the authenticated user.
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingCategory = await prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (existingCategory.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this category' });
    }

    await prisma.category.delete({ where: { id } });

    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
