import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToPush,
  unsubscribeFromPush,
  getVapidPublicKey,
} from '../controllers/notificationController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.post('/push-subscribe', subscribeToPush);
router.delete('/push-subscribe', unsubscribeFromPush);
router.get('/vapid-key', getVapidPublicKey);

export default router;
