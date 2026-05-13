import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getPrivacySettings,
  updatePrivacySettings,
  getBlockedUsers,
  unblockUser,
} from '../controllers/privacyController';

const router = Router();

router.use(requireAuth);

router.get('/privacy', getPrivacySettings);
router.put('/privacy', updatePrivacySettings);
router.get('/blocked', getBlockedUsers);
router.delete('/blocked/:userId', unblockUser);

export default router;
