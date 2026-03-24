import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { users } from '../../db/schema/index';
import { hashPassword, verifyPassword } from '../../utils/hash';
import {
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../errors/index';
import type { UpdateProfileInput, ChangePasswordInput } from './profile.schema';

// ─── Get Profile ──────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isVerified: user.isVerified,
    googleId: user.googleId ? true : false, // Don't expose actual googleId, just whether linked
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Update Profile ───────────────────────────────────────

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updateData: Record<string, string> = {};

  if (input.fullName) {
    updateData.fullName = input.fullName;
  }

  if (input.phoneNumber) {
    updateData.phoneNumber = input.phoneNumber;
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: users.role,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return updated;
}

// ─── Change Password ─────────────────────────────────────

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // OAuth-only users cannot change password
  if (!user.passwordHash) {
    throw new ForbiddenError(
      'This account uses Google sign-in. Password change is not available.',
    );
  }

  // Verify current password
  const isValid = await verifyPassword(user.passwordHash, input.currentPassword);

  if (!isValid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  // Prevent setting same password
  const isSame = await verifyPassword(user.passwordHash, input.newPassword);

  if (isSame) {
    throw new ForbiddenError('New password must be different from current password');
  }

  // Hash and update
  const newHash = await hashPassword(input.newPassword);

  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId));

  return { message: 'Password changed successfully' };
}
