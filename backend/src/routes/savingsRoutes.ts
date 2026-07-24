import { Router } from 'express';
import {
  getPiggybank,
  getTimeSeries,
  getSettings,
  putSettings,
  putPin,
  postUsage,
  getFundedDays,
  putSchedule,
  putOverride,
  deleteOverride,
  rejectSavingsModification,
} from '../controllers/savingsController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All savings routes require authentication (Requirements 10.1, 10.2),
// matching the categoryRoutes convention.
router.use(requireAuth);

// ── Read endpoints (Requirements 5, 6) ───────────────────────────────────────
router.get('/piggybank', getPiggybank);
router.get('/timeseries', getTimeSeries);

// ── Savings settings / enable toggle (Requirements 9.2, 9.3, 9.6, 9.7, 9.8) ──
// Owner-only by construction: the SavingsSettings row is keyed by the
// authenticated userId, so a user can only read/write their own settings.
router.get('/settings', getSettings);
router.put('/settings', putSettings);

// ── Set / change Savings_PIN (Requirements 12.1, 12.2, 12.3, 12.4) ───────────
// Owner-only by construction: the SavingsSettings row is keyed by the
// authenticated userId. Stores only a one-way salted bcrypt hash and returns a
// confirmation ({ pinSet: true }) — the PIN value is never returned.
router.put('/settings/pin', putPin);

// ── PIN-gated savings release-to-budget (Requirements 12.5–12.15, 12.20, 12.21, 9.5) ─────
// Release accumulated savings into the category's current-period budget: writes a
// TOP_UP transaction with a NEGATIVE BUDGET_DEDUCTION (raising remaining), confirmed
// by the Savings_PIN and serialized per user via a SELECT … FOR UPDATE row lock.
// Unspent released money returns to savings when the period closes (auto-return).
router.post('/categories/:categoryId/usage', postUsage);

// ── Funded-day configuration (Requirements 1.x, 2.x) ─────────────────────────
router.get('/categories/:categoryId/funded-days', getFundedDays);
router.put('/categories/:categoryId/schedule', putSchedule);
router.put('/categories/:categoryId/overrides', putOverride);
router.delete('/categories/:categoryId/overrides/:date', deleteOverride);

// ── V1 read-only enforcement (Requirements 12.1, 12.2, 12.5) ─────────────────
// Any attempt to create/update/delete a savings balance or time-series value,
// or to withdraw from savings, is rejected with 405. Savings are derived solely
// from categories/transactions/funded-day config and are never persisted.
router.post('/piggybank', rejectSavingsModification);
router.put('/piggybank', rejectSavingsModification);
router.patch('/piggybank', rejectSavingsModification);
router.delete('/piggybank', rejectSavingsModification);
router.post('/timeseries', rejectSavingsModification);
router.put('/timeseries', rejectSavingsModification);
router.patch('/timeseries', rejectSavingsModification);
router.delete('/timeseries', rejectSavingsModification);
router.all('/withdraw', rejectSavingsModification);
router.all('/withdrawals', rejectSavingsModification);

export default router;
