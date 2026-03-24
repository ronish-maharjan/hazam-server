import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/index';

export function requireCompleteProfile(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  if (!req.user.phoneNumber) {
    throw new ForbiddenError(
      'Profile incomplete. Please add your phone number before accessing this resource.',
    );
  }

  next();
}
