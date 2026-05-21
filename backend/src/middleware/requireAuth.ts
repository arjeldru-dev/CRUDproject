import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Augment the Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

import { gamificationService } from '../services/gamificationService';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback_development_secret';
    const decoded = jwt.verify(token, secret);
    
    // Populate req.user with the decoded payload (should contain the id)
    req.user = decoded;
    
    const timezoneHeader = req.headers['x-timezone'];
    if (timezoneHeader && typeof timezoneHeader === 'string' && req.user && req.user.id) {
      gamificationService.updateUserTimezone(req.user.id, timezoneHeader).catch((error) => {
        console.error('Failed to update user timezone asynchronously:', error);
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }
};
