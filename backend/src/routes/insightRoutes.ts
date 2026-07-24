import { Router } from 'express';
import { getSpendingInsights, getSavingsNudge, getBudgetSummary } from '../controllers/insightController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All insight routes require authentication.
router.use(requireAuth);

router.post('/spending', getSpendingInsights);
router.post('/savings', getSavingsNudge);
router.post('/budget-summary', getBudgetSummary);

export default router;
