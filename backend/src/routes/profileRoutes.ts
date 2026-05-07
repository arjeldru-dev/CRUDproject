import { Router } from 'express';
import {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  getPublicProfile,
  getProfileQR,
  avatarUpload,
} from '../controllers/profileController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All profile routes require authentication
router.use(requireAuth);

// Own profile management
router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);
router.post('/avatar', avatarUpload.single('avatar'), uploadAvatar);

// Public profile views
router.get('/:userId/qr', getProfileQR);
router.get('/:username', getPublicProfile);

export default router;
