import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getFeed,
  getComments,
  reactToPost,
  addComment,
  deleteComment,
  deletePost,
  togglePostPrivacy,
  updatePost,
  likeComment,
} from '../controllers/feedController';

const router = Router();

// All feed routes require authentication
router.use(requireAuth);

router.get('/', getFeed);
router.get('/:postId/comments', getComments);
router.post('/:postId/react', reactToPost);
router.post('/:postId/comment', addComment);
router.post('/comment/:commentId/like', likeComment);
router.delete('/comment/:commentId', deleteComment);
router.delete('/:postId', deletePost);
router.patch('/:postId', updatePost);
router.patch('/:postId/privacy', togglePostPrivacy);

export default router;
