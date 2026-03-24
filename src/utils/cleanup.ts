import { lt } from 'drizzle-orm';
import { db } from '../config/database';
import { refreshTokens, verificationCodes } from '../db/schema/index';
import { logger } from './logger';

/**
 * Removes expired refresh tokens and verification codes from the database.
 * Run this periodically (e.g., daily cron job) to keep tables clean.
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date();

  try {
    // Delete expired refresh tokens
    const deletedTokens = await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, now))
      .returning({ id: refreshTokens.id });

    // Delete expired and used verification codes (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const deletedCodes = await db
      .delete(verificationCodes)
      .where(lt(verificationCodes.expiresAt, oneDayAgo))
      .returning({ id: verificationCodes.id });

    logger.info(
      {
        expiredTokens: deletedTokens.length,
        expiredCodes: deletedCodes.length,
      },
      'Cleanup completed',
    );
  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
  }
}
