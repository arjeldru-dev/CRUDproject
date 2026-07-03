import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({
  connectionString,
  // Keep the pool small so we stay under the free-tier Postgres connection
  // ceiling. Override with DB_POOL_MAX if you move to a larger plan.
  max: Number(process.env.DB_POOL_MAX) || 5,
  // Release idle connections quickly — free-tier Postgres drops them anyway.
  idleTimeoutMillis: 30_000,
  // Fail fast instead of hanging when no connection is available.
  connectionTimeoutMillis: 10_000,
});

// pg emits 'error' on idle clients when the server closes the connection
// (common on free-tier Postgres). Without this handler the event is unhandled
// and can crash the process.
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
