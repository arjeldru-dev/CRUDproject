import { Router } from 'express';
import {
  createExpenseTransaction,
  createSettlement,
  getBalances,
  getBudgetStatus,
} from '../controllers/transactionController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

router.post('/', createExpenseTransaction);
router.post('/settle', createSettlement);
router.get('/balances', getBalances);
router.get('/budget', getBudgetStatus);

export default router;
