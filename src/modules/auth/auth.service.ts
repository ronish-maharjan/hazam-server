import { eq, and, desc, gt, isNull } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  generateOAuthState,
  verifyOAuthState,
  getGoogleAuthUrl,
  getGoogleUser,
} from '../../utils/google-oauth';
import type { GoogleUserInfo } from '../../utils/google-oauth';
import type { UserRole } from '../../config/constants';
import {
  users,
  verificationCodes,
  wallets,
  refreshTokens,
} from '../../db/schema/index';
import {
  VERIFICATION_CODE_TYPES,
  OTP_EXPIRY_MINUTES,
  PASSWORD_RESET_EXPIRY_MINUTES,
  RESEND_OTP_MAX_ATTEMPTS,
  RESEND_OTP_WINDOW_MINUTES,
} from '../../config/constants';
import { hashPassword, verifyPassword, hashToken } from '../../utils/hash';
import { generateOtp } from '../../utils/otp';
import {
  signAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  verifyAccessToken,
} from '../../utils/jwt';
import {
  sendEmail,
  emailVerificationTemplate,
  passwordResetTemplate,
} from '../../utils/email';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  TooManyRequestsError,
} from '../../errors/index';
import type {
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './auth.schema';
import { pool } from '../../config/database';
import type { JwtPayload } from '../../types/index';

// ─── Register ─────────────────────────────────────────────

export async function register(input: RegisterInput) {
  // 1. Check if email already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  // 2. Hash password
  const passwordHash = await hashPassword(input.password);

  // 3. Create user + wallet + verification code in a transaction
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, full_name, email, phone_number, role, is_verified, created_at`,
      [input.fullName, input.email, passwordHash, input.phoneNumber, input.role],
    );

    const newUser = userResult.rows[0];

    // Create wallet
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, '0.00')`,
      [newUser.id],
    );

    // Generate OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await client.query(
      `INSERT INTO verification_codes (user_id, email, code, type, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        newUser.id,
        input.email,
        otp,
        VERIFICATION_CODE_TYPES.EMAIL_VERIFICATION,
        expiresAt,
      ],
    );

    await client.query('COMMIT');

    // 4. Send verification email (fire-and-forget, outside transaction)
    const template = emailVerificationTemplate(input.fullName, otp);
    sendEmail({
      to: input.email,
      subject: template.subject,
      html: template.html,
    }).catch(() => {
      // Email failure should not break registration
    });

    return {
      id: newUser.id,
      fullName: newUser.full_name,
      email: newUser.email,
      phoneNumber: newUser.phone_number,
      role: newUser.role,
      isVerified: newUser.is_verified,
      createdAt: newUser.created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── Verify Email ─────────────────────────────────────────

export async function verifyEmail(input: VerifyEmailInput) {
  // 1. Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  if (user.isVerified) {
    throw new ConflictError('Email is already verified');
  }

  // 2. Find the latest unused, non-expired verification code
  const [code] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, input.email),
        eq(verificationCodes.type, VERIFICATION_CODE_TYPES.EMAIL_VERIFICATION),
        eq(verificationCodes.code, input.code),
        isNull(verificationCodes.usedAt),
        gt(verificationCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!code) {
    throw new UnauthorizedError('Invalid or expired verification code');
  }

  // 3. Mark code as used + mark user as verified (transaction)
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
      [code.id],
    );

    await client.query(
      `UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1`,
      [user.id],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { message: 'Email verified successfully' };
}

// ─── Resend Verification ──────────────────────────────────

export async function resendVerification(input: ResendVerificationInput) {
  // 1. Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  if (user.isVerified) {
    throw new ConflictError('Email is already verified');
  }

  // 2. Rate limit: count recent codes in the window
  const windowStart = new Date(
    Date.now() - RESEND_OTP_WINDOW_MINUTES * 60 * 1000,
  );

  const recentCodes = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, input.email),
        eq(verificationCodes.type, VERIFICATION_CODE_TYPES.EMAIL_VERIFICATION),
        gt(verificationCodes.createdAt, windowStart),
      ),
    );

  if (recentCodes.length >= RESEND_OTP_MAX_ATTEMPTS) {
    throw new TooManyRequestsError(
      `Maximum ${RESEND_OTP_MAX_ATTEMPTS} verification attempts per ${RESEND_OTP_WINDOW_MINUTES} minutes. Please try again later.`,
    );
  }

  // 3. Generate new OTP and store
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(verificationCodes).values({
    userId: user.id,
    email: input.email,
    code: otp,
    type: VERIFICATION_CODE_TYPES.EMAIL_VERIFICATION,
    expiresAt,
  });

  // 4. Send email (fire-and-forget)
  const template = emailVerificationTemplate(user.fullName, otp);
  sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html,
  }).catch(() => {
    // Email failure should not break the flow
  });

  return { message: 'Verification code sent' };
}

// ─── Login ────────────────────────────────────────────────

export async function login(input: LoginInput) {
  // 1. Find user by email
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // 2. Check if user has a password (OAuth-only users don't)
  if (!user.passwordHash) {
    throw new UnauthorizedError(
      'This account uses Google sign-in. Please log in with Google.',
    );
  }

  // 3. Verify password
  const isValid = await verifyPassword(user.passwordHash, input.password);

  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // 4. Generate tokens
  const jwtPayload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiresAt = getRefreshTokenExpiryDate();

  // 5. Store refresh token hash in DB
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isVerified: user.isVerified,
    },
    accessToken,
    refreshToken,
  };
}

// ─── Refresh Token ────────────────────────────────────────

export async function refresh(input: RefreshTokenInput) {
  const tokenHash = hashToken(input.refreshToken);

  // 1. Find the refresh token row by hash
  const [existingToken] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!existingToken) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // 2. Check expiry
  if (existingToken.expiresAt < new Date()) {
    // Clean up expired token
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.id, existingToken.id));

    throw new UnauthorizedError('Refresh token has expired');
  }

  // 3. Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.id, existingToken.userId),
  });

  if (!user) {
    // User was deleted — clean up orphan token
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.id, existingToken.id));

    throw new UnauthorizedError('User not found');
  }

  // 4. Rotate: delete old token, create new one
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const newExpiresAt = getRefreshTokenExpiryDate();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete old token
    await client.query(
      `DELETE FROM refresh_tokens WHERE id = $1`,
      [existingToken.id],
    );

    // Insert new token
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, newRefreshTokenHash, newExpiresAt],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // 5. Issue new access token
  const jwtPayload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isVerified: user.isVerified,
    },
    accessToken,
    refreshToken: newRefreshToken,
  };
}

// ─── Logout ───────────────────────────────────────────────

export async function logout(input: RefreshTokenInput) {
  const tokenHash = hashToken(input.refreshToken);

  // Delete the token row — immediately invalidated
  const result = await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .returning({ id: refreshTokens.id });

  if (result.length === 0) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  return { message: 'Logged out successfully' };
}

// ─── Invalidate All Refresh Tokens (used by password reset) ──

export async function invalidateAllUserTokens(userId: string) {
  await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.userId, userId));
}

// ─── Forgot Password ──────────────────────────────────────

export async function forgotPassword(input: ForgotPasswordInput) {
  // 1. Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  // Always return success even if email not found (prevent email enumeration)
  if (!user) {
    return { message: 'If an account exists with this email, a reset code has been sent' };
  }

  // 2. OAuth-only users cannot reset password
  if (!user.passwordHash) {
    return { message: 'If an account exists with this email, a reset code has been sent' };
  }

  // 3. Rate limit: count recent reset codes in the window
  const windowStart = new Date(
    Date.now() - RESEND_OTP_WINDOW_MINUTES * 60 * 1000,
  );

  const recentCodes = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, input.email),
        eq(verificationCodes.type, VERIFICATION_CODE_TYPES.PASSWORD_RESET),
        gt(verificationCodes.createdAt, windowStart),
      ),
    );

  if (recentCodes.length >= RESEND_OTP_MAX_ATTEMPTS) {
    throw new TooManyRequestsError(
      `Maximum ${RESEND_OTP_MAX_ATTEMPTS} reset attempts per ${RESEND_OTP_WINDOW_MINUTES} minutes. Please try again later.`,
    );
  }

  // 4. Generate OTP and store
  const otp = generateOtp();
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
  );

  await db.insert(verificationCodes).values({
    userId: user.id,
    email: input.email,
    code: otp,
    type: VERIFICATION_CODE_TYPES.PASSWORD_RESET,
    expiresAt,
  });

  // 5. Send email (fire-and-forget)
  const template = passwordResetTemplate(user.fullName, otp);
  sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html,
  }).catch(() => {
    // Email failure should not break the flow
  });

  return { message: 'If an account exists with this email, a reset code has been sent' };
}

// ─── Reset Password ──────────────────────────────────────

export async function resetPassword(input: ResetPasswordInput) {
  // 1. Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (!user) {
    throw new UnauthorizedError('Invalid or expired reset code');
  }

  // 2. OAuth-only users cannot reset password
  if (!user.passwordHash) {
    throw new UnauthorizedError(
      'This account uses Google sign-in. Password reset is not available.',
    );
  }

  // 3. Find latest unused, non-expired reset code
  const [code] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, input.email),
        eq(verificationCodes.type, VERIFICATION_CODE_TYPES.PASSWORD_RESET),
        eq(verificationCodes.code, input.code),
        isNull(verificationCodes.usedAt),
        gt(verificationCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!code) {
    throw new UnauthorizedError('Invalid or expired reset code');
  }

  // 4. Hash new password
  const newPasswordHash = await hashPassword(input.newPassword);

  // 5. Update password + mark code used + invalidate all refresh tokens
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Mark code as used
    await client.query(
      `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
      [code.id],
    );

    // Update password
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newPasswordHash, user.id],
    );

    // Invalidate all refresh tokens (force logout everywhere)
    await client.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [user.id],
    );

    // Mark all unused reset codes for this email as used (prevent reuse)
    await client.query(
      `UPDATE verification_codes
       SET used_at = NOW()
       WHERE email = $1
       AND type = $2
       AND used_at IS NULL`,
      [input.email, VERIFICATION_CODE_TYPES.PASSWORD_RESET],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ─── Google OAuth: Generate Auth URL ──────────────────────

export function getGoogleOAuthUrl(role: 'customer' | 'barber') {
  const state = generateOAuthState(role);
  const url = getGoogleAuthUrl(state);

  return { url };
}

// ─── Google OAuth: Handle Callback ────────────────────────

export async function handleGoogleCallback(code: string, state: string) {
  // 1. Verify state (CSRF protection)
  let statePayload: { role: 'customer' | 'barber'; nonce: string };

  try {
    statePayload = verifyOAuthState(state);
  } catch {
    throw new UnauthorizedError('Invalid or expired OAuth state. Please try again.');
  }

  // 2. Exchange code for Google user info
  let googleUser: GoogleUserInfo;

  try {
    googleUser = await getGoogleUser(code);
  } catch {
    throw new UnauthorizedError('Failed to authenticate with Google. Please try again.');
  }

  // 3. Check if user exists by googleId or email
  let user = await db.query.users.findFirst({
    where: eq(users.googleId, googleUser.googleId),
  });

  let isNewUser = false;

  if (!user) {
    // Check by email (user might have registered with email/password first)
    user = await db.query.users.findFirst({
      where: eq(users.email, googleUser.email.toLowerCase()),
    });

    if (user) {
      // Link Google account to existing user
      await db
        .update(users)
        .set({
          googleId: googleUser.googleId,
          isVerified: true, // Google email is trusted
        })
        .where(eq(users.id, user.id));

      // Refresh user data
      user = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });
    }
  }

  if (!user) {
    // 4. New user — create account with Google profile
    isNewUser = true;
    const role: UserRole = statePayload.role;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (full_name, email, google_id, role, is_verified)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, full_name, email, phone_number, role, is_verified, google_id, created_at`,
        [
          googleUser.fullName,
          googleUser.email.toLowerCase(),
          googleUser.googleId,
          role,
        ],
      );

      user = {
        id: userResult.rows[0].id,
        fullName: userResult.rows[0].full_name,
        email: userResult.rows[0].email,
        phoneNumber: userResult.rows[0].phone_number,
        role: userResult.rows[0].role as UserRole,
        isVerified: userResult.rows[0].is_verified,
        googleId: userResult.rows[0].google_id,
        passwordHash: null,
        createdAt: userResult.rows[0].created_at,
        updatedAt: userResult.rows[0].created_at,
      };

      // Create wallet
      await client.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, '0.00')`,
        [user.id],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (!user) {
    throw new UnauthorizedError('Failed to create or find user account');
  }

  // 5. Generate tokens
  const jwtPayload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiresAt = getRefreshTokenExpiryDate();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    isNewUser,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isVerified: user.isVerified,
    },
    accessToken,
    refreshToken,
  };
}
