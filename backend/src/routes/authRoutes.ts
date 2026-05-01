import { Router, Request, Response } from 'express';
import { register, login } from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/register', register);
router.post('/login', login);

// Protected test route
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ message: 'You are authenticated!', user: req.user });
});

export default router;
