import { z } from 'zod';

// ─── Shared Patterns ─────────────────────────────────────

const NEPAL_PHONE_REGEX = /^\+977-\d{10}$/;

const emailField = z
  .string()
  .email('Invalid email address')
  .min(1, 'Email is required')
  .max(255)
  .transform((v) => v.toLowerCase().trim());

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const fullNameField = z
  .string()
  .min(2, 'Full name must be at least 2 characters')
  .max(255, 'Full name must be at most 255 characters')
  .transform((v) => v.trim());

const phoneNumberField = z
  .string()
  .regex(
    NEPAL_PHONE_REGEX,
    'Phone number must be in Nepal format: +977-XXXXXXXXXX',
  );

const roleField = z.enum(['customer', 'barber'] as const, {
  error: 'Role must be either customer or barber'
})

const otpField = z
  .string()
  .length(6, 'Verification code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'Verification code must contain only digits');

// ─── Register ─────────────────────────────────────────────

export const registerSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  password: passwordField,
  phoneNumber: phoneNumberField,
  role: roleField,
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Verify Email ─────────────────────────────────────────

export const verifyEmailSchema = z.object({
  email: emailField,
  code: otpField,
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ─── Resend Verification ──────────────────────────────────

export const resendVerificationSchema = z.object({
  email: emailField,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// ─── Refresh Token ────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ─── Forgot Password ─────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Reset Password ──────────────────────────────────────

export const resetPasswordSchema = z.object({
  email: emailField,
  code: otpField,
  newPassword: passwordField,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Google OAuth ─────────────────────────────────────────

export const googleOAuthQuerySchema = z.object({
  role: roleField,
});

export type GoogleOAuthQueryInput = z.infer<typeof googleOAuthQuerySchema>;

export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
});

export type GoogleCallbackQueryInput = z.infer<typeof googleCallbackQuerySchema>;
