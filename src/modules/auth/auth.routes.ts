import { Router } from 'express';
import { loginRateLimiter, strictRateLimiter } from '../../middleware/rate-limit';
import { validate, validateQuery } from '../../middleware/validate';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleOAuthQuerySchema,
  googleCallbackQuerySchema,
} from './auth.schema';
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getGoogleOAuthUrl,
  handleGoogleCallback,
} from './auth.service';
import { sendSuccess } from '../../utils/response';
import { env } from '../../config/env';

const router = Router();

// ─── Register ─────────────────────────────────────────────
router.post(
  '/register',
  validate(registerSchema),
  async (req, res) => {
    const data = await register(req.body);
    sendSuccess(res, data, 'Registration successful. Please verify your email.', 201);
  },
);

// ─── Verify Email ─────────────────────────────────────────
router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  async (req, res) => {
    const data = await verifyEmail(req.body);
    sendSuccess(res, data, data.message);
  },
);

// ─── Resend Verification ──────────────────────────────────
router.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  async (req, res) => {
    const data = await resendVerification(req.body);
    sendSuccess(res, data, data.message);
  },
);

// ─── Login ────────────────────────────────────────────────
router.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  async (req, res) => {
    const data = await login(req.body);
    sendSuccess(res, data, 'Login successful');
  },
);


// ─── Refresh Token ────────────────────────────────────────
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  async (req, res) => {
    const data = await refresh(req.body);
    sendSuccess(res, data, 'Token refreshed');
  },
);

// ─── Logout ───────────────────────────────────────────────
router.post(
  '/logout',
  validate(refreshTokenSchema),
  async (req, res) => {
    const data = await logout(req.body);
    sendSuccess(res, data, data.message);
  },
);

// ─── Forgot Password ─────────────────────────────────────
router.post(
  '/forgot-password',
  strictRateLimiter,
  validate(forgotPasswordSchema),
  async (req, res) => {
    const data = await forgotPassword(req.body);
    sendSuccess(res, data, data.message);
  },
);

// ─── Reset Password ──────────────────────────────────────
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  async (req, res) => {
    const data = await resetPassword(req.body);
    sendSuccess(res, data, data.message);
  },
);

// ─── Google OAuth: Initiate ───────────────────────────────
router.get(
  '/google',
  validateQuery(googleOAuthQuerySchema),
  async (req, res) => {
    const { role } = req.query as { role: 'customer' | 'barber' };
    const data = getGoogleOAuthUrl(role);
    res.redirect(data.url);
  },
);

// ─── Google OAuth: Callback ───────────────────────────────
router.get(
  '/google/callback',
  async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };

    // Handle Google error responses (user denied access, etc.)
    if (req.query.error) {
      const errorMessage = encodeURIComponent('Google authentication was cancelled');
      res.redirect(`${env.FRONTEND_URL}/auth/oauth-callback?error=${errorMessage}`);
      return;
    }

    if (!code || !state) {
      const errorMessage = encodeURIComponent('Missing authorization code or state');
      res.redirect(`${env.FRONTEND_URL}/auth/oauth-callback?error=${errorMessage}`);
      return;
    }

    try {
      const data = await handleGoogleCallback(code, state);

      // Build redirect URL with tokens as query params
      const params = new URLSearchParams({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        isNewUser: String(data.isNewUser),
      });

      res.redirect(`${env.FRONTEND_URL}/auth/oauth-callback?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      const errorMessage = encodeURIComponent(message);
      res.redirect(`${env.FRONTEND_URL}/auth/oauth-callback?error=${errorMessage}`);
    }
  },
);

export default router;
