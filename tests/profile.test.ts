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

describe('Profile Module', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ═══════════════════════════════════════════════════════
  // GET /api/profile
  // ═══════════════════════════════════════════════════════
  describe('GET /api/profile', () => {
    // ─── Happy Path ────────────────────────────────────
    it('should return customer profile', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: 'customer',
        isVerified: true,
      });
    });

    it('should return barber profile', async () => {
      const barber = getDefaultBarber();
      const { accessToken } = await registerVerifyAndLogin(barber);

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('barber');
    });

    it('should include id and timestamps', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();
    });

    it('should return googleId as boolean false for email/password user', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.googleId).toBe(false);
    });

    it('should not expose password hash', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should work for unverified user', async () => {
      const payload = getDefaultCustomer();
      await registerUser(payload);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password });

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(false);
    });

    // ─── Auth Guard ────────────────────────────────────
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/profile');

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  // PATCH /api/profile
  // ═══════════════════════════════════════════════════════
  describe('PATCH /api/profile', () => {
    // ─── Happy Path ────────────────────────────────────
    it('should update fullName', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('Updated Name');
    });

    it('should update phoneNumber', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '+977-9899999999' });

      expect(res.status).toBe(200);
      expect(res.body.data.phoneNumber).toBe('+977-9899999999');
    });

    it('should update both fullName and phoneNumber', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fullName: 'New Name',
          phoneNumber: '+977-9811111111',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('New Name');
      expect(res.body.data.phoneNumber).toBe('+977-9811111111');
    });

    it('should persist changes in DB', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Persisted Name' });

      // Fetch profile again to verify
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.fullName).toBe('Persisted Name');
    });

    it('should trim whitespace from fullName', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: '  Trimmed Name  ' });

      expect(res.body.data.fullName).toBe('Trimmed Name');
    });

    it('should work for unverified user (profile completion)', async () => {
      const payload = getDefaultCustomer();
      await registerUser(payload);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password });

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
        .send({ fullName: 'Updated While Unverified' });

      expect(res.status).toBe(200);
    });

    // ─── Validation Errors ─────────────────────────────
    it('should reject empty body', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject fullName shorter than 2 chars', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'A' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid phone number format', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '9812345678' });

      expect(res.status).toBe(400);
    });

    it('should reject phone with wrong country code', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '+91-9812345678' });

      expect(res.status).toBe(400);
    });

    // ─── Auth Guard ────────────────────────────────────
    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .patch('/api/profile')
        .send({ fullName: 'Hacker' });

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  // PATCH /api/profile/change-password
  // ═══════════════════════════════════════════════════════
  describe('PATCH /api/profile/change-password', () => {
    // ─── Happy Path ────────────────────────────────────
    it('should change password successfully', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: user.password,
          newPassword: 'newpassword456',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Password changed');
    });

    it('should allow login with new password after change', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: user.password,
          newPassword: 'newpassword456',
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'newpassword456' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.accessToken).toBeDefined();
    });

    it('should reject login with old password after change', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: user.password,
          newPassword: 'newpassword456',
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });

      expect(loginRes.status).toBe(401);
    });

    // ─── Failure Cases ─────────────────────────────────
    it('should reject wrong current password', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Current password is incorrect');
    });

    it('should reject same password as current', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: user.password,
          newPassword: user.password,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('different');
    });

    it('should reject for OAuth-only user', async () => {
      // Create an OAuth-only user manually in DB
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();

      const userResult = await pool.query(
        `INSERT INTO users (full_name, email, google_id, role, is_verified)
         VALUES ('OAuth User', 'oauth@test.com', 'google-999', 'customer', true)
         RETURNING id`,
      );

      await pool.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, '0.00')`,
        [userResult.rows[0].id],
      );

      // Generate a valid access token for this user
      const { signAccessToken } = await import('../src/utils/jwt');
      const accessToken = signAccessToken({
        userId: userResult.rows[0].id,
        email: 'oauth@test.com',
        role: 'customer',
      });

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'anything',
          newPassword: 'newpassword456',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Google sign-in');
    });

    // ─── Validation ────────────────────────────────────
    it('should reject missing currentPassword', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newPassword: 'newpassword456' });

      expect(res.status).toBe(400);
    });

    it('should reject missing newPassword', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: user.password });

      expect(res.status).toBe(400);
    });

    it('should reject newPassword shorter than 8 chars', async () => {
      const { accessToken, user } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: user.password,
          newPassword: '1234567',
        });

      expect(res.status).toBe(400);
    });

    it('should reject empty body', async () => {
      const { accessToken } = await registerVerifyAndLogin();

      const res = await request(app)
        .patch('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    // ─── Auth Guard ────────────────────────────────────
    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .patch('/api/profile/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        });

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  // OAuth user profile completion flow
  // ═══════════════════════════════════════════════════════
  describe('OAuth user profile completion', () => {
    async function createOAuthUser() {
      const { getTestPool } = await import('./setup');
      const pool = getTestPool();

      const userResult = await pool.query(
        `INSERT INTO users (full_name, email, google_id, role, is_verified)
         VALUES ('Google User', 'google@test.com', 'google-oauth-123', 'customer', true)
         RETURNING id`,
      );

      await pool.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, '0.00')`,
        [userResult.rows[0].id],
      );

      const { signAccessToken } = await import('../src/utils/jwt');
      const accessToken = signAccessToken({
        userId: userResult.rows[0].id,
        email: 'google@test.com',
        role: 'customer',
      });

      return { userId: userResult.rows[0].id, accessToken };
    }

    it('should show null phoneNumber for OAuth user', async () => {
      const { accessToken } = await createOAuthUser();

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.phoneNumber).toBeNull();
      expect(res.body.data.isVerified).toBe(true);
      expect(res.body.data.googleId).toBe(true);
    });

    it('should allow OAuth user to add phone number', async () => {
      const { accessToken } = await createOAuthUser();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '+977-9812345678' });

      expect(res.status).toBe(200);
      expect(res.body.data.phoneNumber).toBe('+977-9812345678');
    });

    it('should allow OAuth user to update fullName', async () => {
      const { accessToken } = await createOAuthUser();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Updated Google User' });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Updated Google User');
    });

    it('should allow OAuth user to set phone and name together', async () => {
      const { accessToken } = await createOAuthUser();

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fullName: 'Complete Profile',
          phoneNumber: '+977-9812345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Complete Profile');
      expect(res.body.data.phoneNumber).toBe('+977-9812345678');
    });

    it('should persist phone number in DB after profile completion', async () => {
      const { accessToken } = await createOAuthUser();

      await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '+977-9812345678' });

      // Verify by fetching profile again
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.phoneNumber).toBe('+977-9812345678');
    });
  });
});
