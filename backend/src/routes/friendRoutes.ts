import { Router } from 'express';
import { createFriend, getFriends, blockUser, reportUser, deleteGhostProfile } from '../controllers/friendController';
import {
  searchUsers,
  sendFriendRequest,
  getReceivedRequests,
  getSentRequests,
  acceptRequest,
  declineRequest,
  cancelRequest,
  getFriendsList,
  removeFriend,
  claimGhostProfile,
  inviteByEmail,
} from '../controllers/friendRequestController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All friend routes require authentication
router.use(requireAuth);

// ── Legacy ghost-profile routes (backward compatibility) ──────────────
router.post('/', createFriend);
router.get('/', getFriends);
router.delete('/ghost/:id', deleteGhostProfile);

// ── Friend Request System (Group 2) ──────────────────────────────────
router.get('/search', searchUsers);
router.post('/request', sendFriendRequest);
router.get('/requests/received', getReceivedRequests);
router.get('/requests/sent', getSentRequests);
router.post('/request/:id/accept', acceptRequest);
router.post('/request/:id/decline', declineRequest);
router.delete('/request/:id/cancel', cancelRequest);
router.get('/list', getFriendsList);
router.post('/ghost/:id/claim', claimGhostProfile);
router.post('/invite', inviteByEmail);
router.delete('/:friendshipId', removeFriend);

// ── Privacy & Blocking System (Group 5) ──────────────────────────────
router.post('/block/:userId', blockUser);
router.post('/report/:userId', reportUser);

export default router;
