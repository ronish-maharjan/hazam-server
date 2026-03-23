import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { pool, closeDatabase } from './config/database';

async function bootstrap(): Promise<void> {
  // ─── Verify DB connection ──────────────────────────────
  try {
    const client = await pool.connect();
    client.release();
    logger.info('✅ Database connected');
  } catch (err) {
    logger.error(err, '❌ Database connection failed');
    process.exit(1);
  }

  // ─── Start HTTP server ─────────────────────────────────
  const server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 Hazam API running on port ${env.PORT} [${env.NODE_ENV}]`,
    );
  });

  // ─── Graceful shutdown ─────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      try {
        await closeDatabase();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error(err, 'Error closing database pool');
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
