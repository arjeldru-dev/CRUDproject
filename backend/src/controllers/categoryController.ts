import { Request, Response } from 'express';
import { prisma } from '../config/db';

const BUDGET_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
type BudgetPeriod = (typeof BUDGET_PERIODS)[number];
const MAX_LIMIT = 999999999;

interface NormalizedPeriodConfig {
  period: BudgetPeriod;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
}

/** Merged view of period params from the request body over the existing row. */
interface PeriodSource {
  monthlyStartDay?: unknown;
  weeklyStartDay?: unknown;
  customPeriodDays?: unknown;
  anchorDate?: unknown;
}

class ValidationError extends Error {}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Normalize a YYYY-MM-DD (or ISO) string to a pure UTC-midnight Date. */
function parseAnchorDate(value: unknown): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new ValidationError('anchorDate must be a valid date');
  }
  const d = new Date(value as string);
  if (isNaN(d.getTime())) throw new ValidationError('anchorDate must be a valid date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Validate the period configuration and null out fields that don't apply to
 * the chosen period. Throws ValidationError (→ 400) on invalid input.
 */
function normalizePeriodConfig(period: BudgetPeriod, src: PeriodSource): NormalizedPeriodConfig {
  const base: NormalizedPeriodConfig = {
    period,
    monthlyStartDay: null,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
  };

  switch (period) {
    case 'DAILY':
      return base;

    case 'WEEKLY': {
      const wsd = src.weeklyStartDay;
      if (!isInt(wsd) || wsd < 0 || wsd > 6) {
        throw new ValidationError('weeklyStartDay must be an integer 0–6 for a weekly budget');
      }
      return { ...base, weeklyStartDay: wsd };
    }

    case 'MONTHLY': {
      const msd = src.monthlyStartDay;
      if (msd === undefined || msd === null) {
        return base; // defaults to the calendar 1st
      }
      if (!isInt(msd) || !(msd === -1 || (msd >= 1 && msd <= 31))) {
        throw new ValidationError('monthlyStartDay must be an integer 1–31, or -1 for "last day of month"');
      }
      return { ...base, monthlyStartDay: msd };
    }

    case 'CUSTOM': {
      const days = src.customPeriodDays;
      if (!isInt(days) || days < 1 || days > 366) {
        throw new ValidationError('customPeriodDays must be an integer 1–366 for a custom budget');
      }
      if (src.anchorDate === undefined || src.anchorDate === null) {
        throw new ValidationError('anchorDate is required for a custom budget');
      }
      return { ...base, customPeriodDays: days, anchorDate: parseAnchorDate(src.anchorDate) };
    }

    default:
      throw new ValidationError(`period must be one of: ${BUDGET_PERIODS.join(', ')}`);
  }
}

function validateLimitAmount(limitAmount: unknown): void {
  if (typeof limitAmount !== 'number' || limitAmount < 0) {
    throw new ValidationError('limitAmount must be a non-negative number');
  }
  if (limitAmount > MAX_LIMIT) {
    throw new ValidationError(`limitAmount cannot exceed ${MAX_LIMIT}`);
  }
}

/**
 * POST /api/categories
 * Creates a new budget category for the authenticated user.
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, limitAmount, period } = req.body;

    if (!name || limitAmount === undefined || limitAmount === null) {
      return res.status(400).json({ error: 'Name and limitAmount are required' });
    }

    validateLimitAmount(limitAmount);

    const effectivePeriod: BudgetPeriod = period ?? 'MONTHLY';
    if (!BUDGET_PERIODS.includes(effectivePeriod)) {
      return res.status(400).json({ error: `period must be one of: ${BUDGET_PERIODS.join(', ')}` });
    }

    const config = normalizePeriodConfig(effectivePeriod, req.body);

    const category = await prisma.category.create({
      data: {
        name,
        limitAmount,
        userId: req.user.id,
        ...config,
      },
    });

    return res.status(201).json({ category });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
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
    const touchesPeriod = PERIOD_PARAM_KEYS.some((k) => k in req.body);

    if (!name && (limitAmount === undefined || limitAmount === null) && !touchesPeriod) {
      return res.status(400).json({ error: 'At least one field (name, limitAmount, or period config) is required' });
    }

    if (limitAmount !== undefined) {
      validateLimitAmount(limitAmount);
    }

    const existingCategory = await prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (existingCategory.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this category' });
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (limitAmount !== undefined) updateData.limitAmount = limitAmount;

    if (touchesPeriod) {
      const effectivePeriod: BudgetPeriod = (req.body.period ?? existingCategory.period) as BudgetPeriod;
      if (!BUDGET_PERIODS.includes(effectivePeriod)) {
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

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({ category: updatedCategory });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
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
