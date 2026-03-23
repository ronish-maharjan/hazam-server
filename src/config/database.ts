import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from './env';
import * as schema from '../db/schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === 'development' });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
