// vitest.config.ts
import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Parse .env.test into an object
const envFile = dotenv.parse(
  fs.readFileSync(path.resolve(process.cwd(), '.env.test'))
)

export default defineConfig({
  test: {
    env: envFile,           // ← vitest injects this into workers
    setupFiles: ['./tests/setup.ts'],
  }
})
