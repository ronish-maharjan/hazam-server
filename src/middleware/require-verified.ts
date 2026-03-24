import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/index';

export function requireVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  if (!req.user.isVerified) {
    throw new ForbiddenError(
      'Email verification required. Please verify your email before accessing this resource.',
    );
  }

  next();
}
