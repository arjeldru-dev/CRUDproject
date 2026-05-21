import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getGamificationProfile,
  setActiveFrame,
  getLeaderboard,
  getChallenges,
  createChallenge,
  joinChallenge,
  cancelChallenge,
} from '../controllers/gamificationController';

const router = Router();

// All gamification routes require authentication
router.use(requireAuth);

router.get('/profile', getGamificationProfile);
router.put('/frame', setActiveFrame);
router.get('/leaderboard', getLeaderboard);
router.get('/challenges', getChallenges);
router.post('/challenges', createChallenge);
router.post('/challenges/:id/join', joinChallenge);
router.delete('/challenges/:id', cancelChallenge);

export default router;
