import { Router } from 'express';
import {
  createExpenseTransaction,
  createSettlement,
  createTopUp,
  getBalances,
  getBudgetStatus,
  getPendingTransactions,
  respondToPendingTransaction,
} from '../controllers/transactionController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

router.post('/', createExpenseTransaction);
router.post('/settle', createSettlement);
router.post('/topup', createTopUp);
router.get('/balances', getBalances);
router.get('/budget', getBudgetStatus);
router.get('/pending', getPendingTransactions);
router.post('/pending/:id/respond', respondToPendingTransaction);

export default router;
