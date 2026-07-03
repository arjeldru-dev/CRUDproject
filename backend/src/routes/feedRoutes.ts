import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getFeed,
  getComments,
  reactToPost,
  getPostReactors,
  addComment,
  deleteComment,
  deletePost,
  togglePostPrivacy,
  updatePost,
  reactToComment,
  getCommentReactors,
} from '../controllers/feedController';

const router = Router();

// All feed routes require authentication
router.use(requireAuth);

router.get('/', getFeed);
router.get('/:postId/comments', getComments);
router.post('/:postId/react', reactToPost);
router.get('/:postId/reactions', getPostReactors);
router.post('/:postId/comment', addComment);
router.post('/comment/:commentId/react', reactToComment);
router.get('/comment/:commentId/reactions', getCommentReactors);
router.delete('/comment/:commentId', deleteComment);
router.delete('/:postId', deletePost);
router.patch('/:postId', updatePost);
router.patch('/:postId/privacy', togglePostPrivacy);

export default router;
