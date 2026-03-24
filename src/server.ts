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

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── Unhandled errors ──────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap();
