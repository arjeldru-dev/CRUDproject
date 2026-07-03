export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

/**
 * Short label for a budget period, used on badges/tags.
 * (The API's `periodLabel` — "Today", "This week", … — is kept for
 * sentence-style copy like "Projected for this week".)
 */
export function periodName(period?: BudgetPeriod | string | null): string {
  switch (period) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'CUSTOM':
      return 'Custom';
    default:
      return '';
  }
}
