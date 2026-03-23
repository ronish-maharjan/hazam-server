import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../src/config/env';
import * as schema from '../src/db/schema';
import { afterAll, beforeAll } from 'vitest';
let testPool: Pool;

export function getTestDb() {
  return drizzle(testPool, { schema });
}

export function getTestPool() {
  return testPool;
}

beforeAll(async () => {
  testPool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  // Verify connectivity
  const client = await testPool.connect();
  client.release();
});

afterAll(async () => {
  await testPool.end();
});
