import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { verifyAccessToken } from '../utils/jwt';
import { db } from '../config/database';
import { users } from '../db/schema/index';
import { UnauthorizedError } from '../errors/index';
import type { AuthUser } from '../types/index';

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('Authorization header is required');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization header must use Bearer scheme');
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  if (!token) {
    throw new UnauthorizedError('Access token is required');
  }

  // 2. Verify JWT
  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  // 3. Fetch user from DB (ensures user still exists and data is fresh)
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) {
    throw new UnauthorizedError('User account no longer exists');
  }

  // 4. Attach user to request
  const authUser: AuthUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
    phoneNumber: user.phoneNumber,
    googleId: user.googleId,
  };

  req.user = authUser;
  next();
}
