import rateLimit from 'express-rate-limit';

// ─── Login rate limiter ──────────────────────────────────
// Prevents brute-force password guessing
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => {
    // Rate limit by IP + email combination
    const email = req.body?.email || 'unknown';
    return `${req.ip}-${email}`;
  },
});

// ─── General API rate limiter ────────────────────────────
// Prevents abuse of all endpoints
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

// ─── Strict rate limiter for sensitive operations ────────
// Coupon redemption, password change
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please try again after 15 minutes.',
  },
});
