import { Router } from 'express';
import { createFriend, getFriends } from '../controllers/friendController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All friend routes require authentication
router.use(requireAuth);

router.post('/', createFriend);
router.get('/', getFriends);

export default router;
