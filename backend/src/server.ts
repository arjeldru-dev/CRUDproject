import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { prisma } from './config/db';
import authRoutes from './routes/authRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Apply middlewares
app.use(cors({ credentials: true, origin: true }));
app.use(helmet());
app.use(express.json());

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Hybrid Ledger API' });
});

// Authentication routes
app.use('/api/auth', authRoutes);

app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log('✅ Postgres/Prisma database connected securely.');
    console.log(`🚀 Server is running gracefully on port ${PORT}`);
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    process.exit(1);
  }
});
