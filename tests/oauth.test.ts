import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { cleanupDatabase, registerUser, getDefaultCustomer } from './helpers';

// ─── Mock Google OAuth (only the external API call) ──────
const mockGetGoogleUser = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/google-oauth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/utils/google-oauth')>();
  return {
    ...mod,
    getGoogleUser: mockGetGoogleUser,
  };
});

import app from '../src/app';

// ─── Helpers ─────────────────────────────────────────────

function createValidState(role: 'customer' | 'barber'): string {
  return jwt.sign(
    { role, nonce: 'test-nonce-123' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' },
  );
}

function createExpiredState(role: 'customer' | 'barber'): string {
  return jwt.sign(
    { role, nonce: 'test-nonce-expired' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '-10s' },
  );
}

const GOOGLE_USER = {
  googleId: 'google-123456',
  email: 'oauthuser@gmail.com',
  fullName: 'OAuth User',
};

function parseRedirectUrl(res: request.Response): URL {
  return new URL(res.headers.location);
}

// ─── Tests ───────────────────────────────────────────────

describe('Google OAuth', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/auth/google — Initiate OAuth
  // ═══════════════════════════════════════════════════════
  describe('GET /api/auth/google', () => {
    it('should redirect to Google with role=customer', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=customer')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
    });

    it('should redirect to Google with role=barber', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=barber')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
    });

    it('should include state parameter in redirect URL', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=customer')
        .redirects(0);

      expect(res.headers.location).toContain('state=');
    });

    it('should include required OAuth scopes', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=customer')
        .redirects(0);

      const location = decodeURIComponent(res.headers.location);
      expect(location).toContain('openid');
      expect(location).toContain('email');
      expect(location).toContain('profile');
    });

    it('should reject missing role parameter', async () => {
      const res = await request(app)
        .get('/api/auth/google');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject role=admin', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=admin');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject empty role', async () => {
      const res = await request(app)
        .get('/api/auth/google?role=');

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/auth/google/callback — New Users
  // ═══════════════════════════════════════════════════════
  describe('GET /api/auth/google/callback — new user', () => {
    it('should create new customer and redirect with tokens', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      const res = await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      expect(res.status).toBe(302);

      const location = parseRedirectUrl(res);
      expect(location.pathname).toBe('/auth/oauth-callback');
      expect(location.searchParams.get('accessToken')).toBeTruthy();
      expect(location.searchParams.get('refreshToken')).toBeTruthy();
      expect(location.searchParams.get('isNewUser')).toBe('true');
    });

    it('should create new barber and redirect with tokens', async () => {
      const state = createValidState('barber');
      mockGetGoogleUser.mockResolvedValueOnce({
        ...GOOGLE_USER,
        email: 'barber.oauth@gmail.com',
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      expect(res.status).toBe(302);

      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('isNewUser')).toBe('true');

      // Verify user in DB
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT role, is_verified, google_id FROM users WHERE email = $1',
        ['barber.oauth@gmail.com'],
      );

      expect(result.rows[0].role).toBe('barber');
      expect(result.rows[0].is_verified).toBe(true);
      expect(result.rows[0].google_id).toBe(GOOGLE_USER.googleId);
    });

    it('should set isVerified to true for OAuth user', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT is_verified FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );

      expect(result.rows[0].is_verified).toBe(true);
    });

    it('should create wallet with 0.00 balance for new OAuth user', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        `SELECT w.balance FROM wallets w
         JOIN users u ON u.id = w.user_id
         WHERE u.email = $1`,
        [GOOGLE_USER.email],
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].balance).toBe('0.00');
    });

    it('should set phoneNumber to null for OAuth user', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT phone_number FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );

      expect(result.rows[0].phone_number).toBeNull();
    });

    it('should store fullName from Google profile', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code-123&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT full_name FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );

      expect(result.rows[0].full_name).toBe(GOOGLE_USER.fullName);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/auth/google/callback — Returning Users
  // ═══════════════════════════════════════════════════════
  describe('GET /api/auth/google/callback — returning user', () => {
    it('should login existing Google user with isNewUser=false', async () => {
      // First login — creates user
      const state1 = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=code-1&state=${state1}`)
        .redirects(0);

      // Second login — existing user
      const state2 = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      const res = await request(app)
        .get(`/api/auth/google/callback?code=code-2&state=${state2}`)
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('isNewUser')).toBe('false');
      expect(location.searchParams.get('accessToken')).toBeTruthy();
    });

    it('should not create duplicate user on repeat OAuth login', async () => {
      const state1 = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);
      await request(app)
        .get(`/api/auth/google/callback?code=code-1&state=${state1}`)
        .redirects(0);

      const state2 = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);
      await request(app)
        .get(`/api/auth/google/callback?code=code-2&state=${state2}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT COUNT(*) FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );

      expect(parseInt(result.rows[0].count, 10)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/auth/google/callback — Account Linking
  // ═══════════════════════════════════════════════════════
  describe('GET /api/auth/google/callback — account linking', () => {
    it('should link Google to existing email/password account', async () => {
      // Register with email/password using same email
      await registerUser(getDefaultCustomer({ email: GOOGLE_USER.email }));

      // OAuth with same email
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      const res = await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      expect(res.status).toBe(302);

      // Verify googleId was linked
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        'SELECT google_id, is_verified, password_hash FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );

      expect(result.rows[0].google_id).toBe(GOOGLE_USER.googleId);
      expect(result.rows[0].is_verified).toBe(true);
      // Password should still exist
      expect(result.rows[0].password_hash).toBeTruthy();
    });

    it('should verify unverified email/password account on Google link', async () => {
      // Register but DON'T verify
      await registerUser(getDefaultCustomer({ email: GOOGLE_USER.email }));

      // Confirm not verified
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const before = await pool.query(
        'SELECT is_verified FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );
      expect(before.rows[0].is_verified).toBe(false);

      // OAuth link
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      const after = await pool.query(
        'SELECT is_verified FROM users WHERE email = $1',
        [GOOGLE_USER.email],
      );
      expect(after.rows[0].is_verified).toBe(true);
    });

    it('should not create duplicate wallet when linking accounts', async () => {
      // Register creates a wallet
      await registerUser(getDefaultCustomer({ email: GOOGLE_USER.email }));

      // OAuth link
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        `SELECT COUNT(*) FROM wallets w
         JOIN users u ON u.id = w.user_id
         WHERE u.email = $1`,
        [GOOGLE_USER.email],
      );

      expect(parseInt(result.rows[0].count, 10)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/auth/google/callback — Error Cases
  // ═══════════════════════════════════════════════════════
  describe('GET /api/auth/google/callback — errors', () => {
    it('should redirect with error when code is missing', async () => {
      const state = createValidState('customer');

      const res = await request(app)
        .get(`/api/auth/google/callback?state=${state}`)
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error when state is missing', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?code=some-code')
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error when both code and state are missing', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback')
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error for invalid state token', async () => {
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      const res = await request(app)
        .get('/api/auth/google/callback?code=auth-code&state=tampered-invalid-state')
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error for expired state token', async () => {
      const expiredState = createExpiredState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      const res = await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${expiredState}`)
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error when Google API fails', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockRejectedValueOnce(new Error('Google API error'));

      const res = await request(app)
        .get(`/api/auth/google/callback?code=bad-code&state=${state}`)
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should redirect with error when Google returns error param', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?error=access_denied')
        .redirects(0);

      expect(res.status).toBe(302);
      const location = parseRedirectUrl(res);
      expect(location.searchParams.get('error')).toBeTruthy();
    });

    it('should not create user when Google API fails', async () => {
      const state = createValidState('customer');
      mockGetGoogleUser.mockRejectedValueOnce(new Error('API error'));

      await request(app)
        .get(`/api/auth/google/callback?code=bad-code&state=${state}`)
        .redirects(0);

      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query('SELECT COUNT(*) FROM users');

      expect(parseInt(result.rows[0].count, 10)).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Cross-flow: OAuth user + password login
  // ═══════════════════════════════════════════════════════
  describe('OAuth + password login interaction', () => {
    it('should reject password login for OAuth-only user', async () => {
      // Create user via OAuth (no password)
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      // Try password login
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: GOOGLE_USER.email, password: 'anypassword' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Google sign-in');
    });

    it('should allow password login for linked account', async () => {
      const password = 'password123';

      // Register with email/password
      await registerUser(getDefaultCustomer({
        email: GOOGLE_USER.email,
        password,
      }));

      // Link Google account
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      // Password login should still work
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: GOOGLE_USER.email, password });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject forgot-password for OAuth-only user (silently)', async () => {
      // Create OAuth-only user
      const state = createValidState('customer');
      mockGetGoogleUser.mockResolvedValueOnce(GOOGLE_USER);

      await request(app)
        .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
        .redirects(0);

      // Forgot password — should return success (anti-enumeration)
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: GOOGLE_USER.email });

      expect(res.status).toBe(200);

      // But no reset code should be created
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      const result = await pool.query(
        `SELECT COUNT(*) FROM verification_codes
         WHERE email = $1 AND type = 'password_reset'`,
        [GOOGLE_USER.email],
      );

      expect(parseInt(result.rows[0].count, 10)).toBe(0);
    });
  });
});
