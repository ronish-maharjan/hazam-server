import { Pool } from 'pg';
import { env } from '../src/config/env';
import { afterAll, beforeAll } from 'vitest';

let testPool: Pool;

export function getTestPool() {
  return testPool;
}

beforeAll(async () => {
  testPool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  const client = await testPool.connect();
  client.release();
});

afterAll(async () => {
  await testPool.end();
});
