import type { UserRole } from '../config/constants';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
  phoneNumber: string | null;
  googleId: string | null;
}

// Augment Express Request globally so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
