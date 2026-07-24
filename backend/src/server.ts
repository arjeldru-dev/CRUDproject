import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from './config/db';
import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import friendRoutes from './routes/friendRoutes';
import transactionRoutes from './routes/transactionRoutes';
import profileRoutes from './routes/profileRoutes';
import feedRoutes from './routes/feedRoutes';
import notificationRoutes from './routes/notificationRoutes';
import privacyRoutes from './routes/privacyRoutes';
import gamificationRoutes from './routes/gamificationRoutes';
import savingsRoutes from './routes/savingsRoutes';
import insightRoutes from './routes/insightRoutes';
import { warmUpNotificationCopy } from './services/notificationCopyService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Apply middlewares
app.use(cors({ credentials: true, origin: true }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());

// Serve uploaded files (avatars)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'BudgetBarkada API' });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Protected resource routes (requireAuth is applied inside the router)
app.use('/api/categories', categoryRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', privacyRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/insights', insightRoutes);

app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log('✅ Postgres/Prisma database connected securely.');
    console.log(`🚀 Server is running gracefully on port ${PORT}`);
    // Pre-generate friendly notification-copy templates so the first real
    // notification never waits on the LLM. Non-blocking + best-effort: no-op when
    // the LLM is unconfigured, and any failure simply falls back to today's copy.
    void warmUpNotificationCopy().catch(() => {
      /* best-effort warm-up; lazy first-miss populate remains the fallback */
    });
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    process.exit(1);
  }
});
