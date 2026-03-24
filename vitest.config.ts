import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envFile = dotenv.parse(
  fs.readFileSync(path.resolve(process.cwd(), '.env.test')),
);

export default defineConfig({
  test: {
    env: envFile,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
