import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import {
  cleanupDatabase,
  registerUser,
  getDefaultCustomer,
  getDefaultBarber,
  getVerificationCode,
  registerVerifyAndLogin,
} from './helpers';
import { signAccessToken } from '../src/utils/jwt';

describe('Middleware', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ═══════════════════════════════════════════════════════
  // requireAuth
  // ═══════════════════════════════════════════════════════
  describe('requireAuth', () => {
    it('should allow request with valid access token', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject request without Authorization header', async () => {
      const res = await request(app).get('/api/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authorization header');
    });

    it('should reject request with empty Authorization header', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', '');

      expect(res.status).toBe(401);
    });

    it('should reject request without Bearer scheme', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Token sometoken');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Bearer');
    });

    it('should reject request with Bearer but no token', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid JWT', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or expired');
    });

    it('should reject request with expired JWT', async () => {
      // Create a token that's already expired
      const jwt = await import('jsonwebtoken');
      const { env } = await import('../src/config/env');

      const expiredToken = jwt.default.sign(
        { userId: 'some-id', email: 'test@test.com', role: 'customer' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '-10s' },
      );

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject token for deleted user', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      // Delete user directly from DB
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();
      await pool.query('DELETE FROM users WHERE email = $1', [user.email]);

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('no longer exists');
    });

    it('should reject token signed with wrong secret', async () => {
      const jwt = await import('jsonwebtoken');

      const badToken = jwt.default.sign(
        { userId: 'some-id', email: 'test@test.com', role: 'customer' },
        'wrong-secret-that-is-at-least-32-chars',
        { expiresIn: '15m' },
      );

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${badToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  // requireVerified (tested indirectly — will be tested
  // more in booking/wallet steps. Basic check here.)
  // ═══════════════════════════════════════════════════════
  describe('requireVerified', () => {
    it('should allow verified user', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      // Profile doesn't require verified, so we test the concept
      // by checking the user data shows isVerified: true
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(true);
    });

    it('should allow unverified user to access profile (no requireVerified on profile)', async () => {
      // Register but DON'T verify
      const payload = getDefaultCustomer();
      await registerUser(payload);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password });

      const accessToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // requireRole (tested indirectly here, fully tested
  // when shop/booking/admin routes are built)
  // ═══════════════════════════════════════════════════════
  describe('requireRole', () => {
    it('should return user with correct role in profile', async () => {
      const { accessToken } = await registerVerifyAndLogin(
        getDefaultCustomer(),
      );

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.role).toBe('customer');
    });

    it('should return barber role correctly', async () => {
      const barberPayload = getDefaultBarber();
      await registerUser(barberPayload);

      const code = await getVerificationCode(barberPayload.email);
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: barberPayload.email, code });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: barberPayload.email, password: barberPayload.password });

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

      expect(res.body.data.role).toBe('barber');
    });
  });
});
