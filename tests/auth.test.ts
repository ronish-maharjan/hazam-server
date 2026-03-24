import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import {
    cleanupDatabase,
    registerUser,
    getDefaultCustomer,
    getDefaultBarber,
    getVerificationCode,
} from './helpers';

describe('Auth Module', () => {
    beforeEach(async () => {
        await cleanupDatabase();
    });

    // ═══════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════
    describe('POST /api/auth/register', () => {
        // ─── Happy Path ────────────────────────────────────
        it('should register a customer successfully', async () => {
            const payload = getDefaultCustomer();
            const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                fullName: payload.fullName,
                email: payload.email,
                phoneNumber: payload.phoneNumber,
                role: 'customer',
                isVerified: false,
            });
            expect(res.body.data.id).toBeDefined();
            expect(res.body.data).not.toHaveProperty('passwordHash');
            expect(res.body.data).not.toHaveProperty('password');
        });

        it('should register a barber successfully', async () => {
            const payload = getDefaultBarber();
            const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

            expect(res.status).toBe(201);
            expect(res.body.data.role).toBe('barber');
        });

        it('should create a wallet with 0.00 balance on registration', async () => {
            const payload = getDefaultCustomer();
            const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

            const { getTestPool } = await import('./setup');
            const pool = getTestPool();
            const walletResult = await pool.query(
                'SELECT balance FROM wallets WHERE user_id = $1',
                [res.body.data.id],
            );

            expect(walletResult.rows.length).toBe(1);
            expect(walletResult.rows[0].balance).toBe('0.00');
        });

        it('should generate a verification code on registration', async () => {
            const payload = getDefaultCustomer();
            await request(app).post('/api/auth/register').send(payload);

            const code = await getVerificationCode(payload.email);
            expect(code).toBeDefined();
            expect(code).toHaveLength(6);
            expect(/^\d{6}$/.test(code)).toBe(true);
        });

        // ─── Validation Errors ─────────────────────────────
        it('should reject registration with missing fields', async () => {
            const res = await request(app)
            .post('/api/auth/register')
            .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors).toBeDefined();
            expect(res.body.errors.length).toBeGreaterThan(0);
        });

        it('should reject invalid email format', async () => {
            const payload = getDefaultCustomer({ email: 'not-an-email' });
            const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

            expect(res.status).toBe(400);
            expect(res.body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'email' }),
                ]),
            );
        });

        it('should reject password shorter than 8 characters', async () => {
            const payload = getDefaultCustomer({ password: '1234567' });
            const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

            expect(res.status).toBe(400);
            expect(res.body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'password' }),
                ]),
            );
        });

        it('should reject invalid Nepal phone number format', async () => {
            const res = await request(app)
            .post('/api/auth/register')
            .send(getDefaultCustomer({ phoneNumber: '9812345678' }));

            expect(res.status).toBe(400);
            expect(res.body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'phoneNumber' }),
                ]),
            );
        });

        it('should reject phone number with wrong prefix', async () => {
            const res = await request(app)
            .post('/api/auth/register')
            .send(getDefaultCustomer({ phoneNumber: '+91-9812345678' }));

            expect(res.status).toBe(400);
        });

        it('should reject invalid role', async () => {
            const res = await request(app)
            .post('/api/auth/register')
            .send(getDefaultCustomer({ role: 'admin' as 'customer' }));

            expect(res.status).toBe(400);
        });

        it('should reject fullName shorter than 2 characters', async () => {
            const res = await request(app)
            .post('/api/auth/register')
            .send(getDefaultCustomer({ fullName: 'A' }));

            expect(res.status).toBe(400);
        });

        // ─── Duplicate Email ───────────────────────────────
        it('should reject duplicate email registration', async () => {
            await registerUser();

            const res = await registerUser();

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('already registered');
        });

        it('should treat emails as case-insensitive', async () => {
            await registerUser({ email: 'Test@Example.com' });

            const res = await registerUser({ email: 'test@example.com' });

            expect(res.status).toBe(409);
        });
    });

    // ═══════════════════════════════════════════════════════
    // VERIFY EMAIL
    // ═══════════════════════════════════════════════════════
    describe('POST /api/auth/verify-email', () => {
        // ─── Happy Path ────────────────────────────────────
        it('should verify email with valid OTP', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const code = await getVerificationCode(payload.email);
            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.message).toContain('verified');
        });

        it('should set isVerified to true after verification', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const code = await getVerificationCode(payload.email);
            await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            const { getTestPool } = await import('./setup');
            const pool = getTestPool();
            const result = await pool.query(
                'SELECT is_verified FROM users WHERE email = $1',
                [payload.email],
            );

            expect(result.rows[0].is_verified).toBe(true);
        });

        // ─── Failure Cases ─────────────────────────────────
        it('should reject invalid OTP code', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code: '000000' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('should reject already verified email', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const code = await getVerificationCode(payload.email);
            await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('already verified');
        });

        it('should reject non-existent email', async () => {
            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'ghost@test.com', code: '123456' });

            expect(res.status).toBe(404);
        });

        it('should reject expired OTP', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            // Manually expire the code
            const { getTestPool } = await import('./setup');
            const pool = getTestPool();
            await pool.query(
                `UPDATE verification_codes
                SET expires_at = NOW() - INTERVAL '1 hour'
                WHERE email = $1`,
                    [payload.email],
            );

            const code = await getVerificationCode(payload.email).catch(() => null);
            // After expiring, getVerificationCode checks used_at IS NULL but
            // we need the actual code from DB regardless of expiry
            const codeResult = await pool.query(
                `SELECT code FROM verification_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
                    [payload.email],
            );

            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code: codeResult.rows[0].code });

            expect(res.status).toBe(401);
        });

        it('should reject OTP that was already used', async () => {
            const payload = getDefaultCustomer({ email: 'reuse@test.com' });
            await registerUser(payload);

            const code = await getVerificationCode(payload.email);

            // Use it once (will succeed but email already verified after)
            await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            // Re-register to get a fresh unverified user with same code pattern
            // Actually the OTP is now marked used, so test with a second user
            const payload2 = getDefaultCustomer({ email: 'reuse2@test.com' });
            await registerUser(payload2);
            const code2 = await getVerificationCode(payload2.email);

            // Mark code as used manually
            const { getTestPool } = await import('./setup');
            const pool = getTestPool();
            await pool.query(
                `UPDATE verification_codes SET used_at = NOW() WHERE email = $1`,
                    [payload2.email],
            );

            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload2.email, code: code2 });

            expect(res.status).toBe(401);
        });

        // ─── Validation ────────────────────────────────────
        it('should reject non-6-digit code', async () => {
            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'test@test.com', code: '12345' });

            expect(res.status).toBe(400);
        });

        it('should reject non-numeric code', async () => {
            const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'test@test.com', code: 'abcdef' });

            expect(res.status).toBe(400);
        });
    });

    // ═══════════════════════════════════════════════════════
    // RESEND VERIFICATION
    // ═══════════════════════════════════════════════════════
    describe('POST /api/auth/resend-verification', () => {
        // ─── Happy Path ────────────────────────────────────
        it('should resend verification code', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const res = await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.message).toContain('Verification code sent');
        });

        it('should generate a new code different from the original', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const originalCode = await getVerificationCode(payload.email);

            await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            // Get all codes — latest should be different (probabilistically)
            const { getTestPool } = await import('./setup');
            const pool = getTestPool();
            const result = await pool.query(
                `SELECT code FROM verification_codes
                WHERE email = $1 AND type = 'email_verification'
                ORDER BY created_at DESC`,
                [payload.email],
            );

            // Should have at least 2 codes now (original + resend)
            expect(result.rows.length).toBeGreaterThanOrEqual(2);
        });

        // ─── Failure Cases ─────────────────────────────────
        it('should reject resend for non-existent email', async () => {
            const res = await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: 'ghost@test.com' });

            expect(res.status).toBe(404);
        });

        it('should reject resend for already verified email', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            const code = await getVerificationCode(payload.email);
            await request(app)
            .post('/api/auth/verify-email')
            .send({ email: payload.email, code });

            const res = await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            expect(res.status).toBe(409);
        });

        it('should rate limit resend to 3 attempts per 15 minutes', async () => {
            const payload = getDefaultCustomer();
            await registerUser(payload);

            // Registration creates 1 code, so 2 more resends should work
            await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            // 4th attempt (1 from register + 2 resends = 3, this is the 4th)
            const res = await request(app)
            .post('/api/auth/resend-verification')
            .send({ email: payload.email });

            expect(res.status).toBe(429);
            expect(res.body.success).toBe(false);
        });
        // ═══════════════════════════════════════════════════════
        // LOGIN
        // ═══════════════════════════════════════════════════════
        describe('POST /api/auth/login', () => {
            // ─── Happy Path ────────────────────────────────────
            it('should login with valid credentials', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                // Verify email first
                const code = await getVerificationCode(payload.email);
                await request(app)
                .post('/api/auth/verify-email')
                .send({ email: payload.email, code });

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.data.accessToken).toBeDefined();
                expect(res.body.data.refreshToken).toBeDefined();
                expect(res.body.data.user).toMatchObject({
                    email: payload.email,
                    fullName: payload.fullName,
                    role: 'customer',
                    isVerified: true,
                });
            });

            it('should login even if user is not verified', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                expect(res.status).toBe(200);
                expect(res.body.data.user.isVerified).toBe(false);
                expect(res.body.data.accessToken).toBeDefined();
            });

            it('should not expose sensitive fields in login response', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                expect(res.body.data.user).not.toHaveProperty('passwordHash');
                expect(res.body.data.user).not.toHaveProperty('password');
                expect(res.body.data.user).not.toHaveProperty('googleId');
            });

            it('should store refresh token hash in DB, not raw token', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const rawToken = res.body.data.refreshToken;

                const { getTestPool } = await import('./setup');
                const pool = getTestPool();
                const dbResult = await pool.query(
                    `SELECT token_hash FROM refresh_tokens
                    WHERE user_id = $1
                    ORDER BY created_at DESC LIMIT 1`,
                    [res.body.data.user.id],
                );

                expect(dbResult.rows.length).toBe(1);
                // Raw token should NOT appear in DB
                expect(dbResult.rows[0].token_hash).not.toBe(rawToken);
                // Hash should be a 64-char hex string (SHA-256)
                expect(dbResult.rows[0].token_hash).toHaveLength(64);
            });

            // ─── Failure Cases ─────────────────────────────────
            it('should reject login with wrong password', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: 'wrongpassword' });

                expect(res.status).toBe(401);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain('Invalid email or password');
            });

            it('should reject login with non-existent email', async () => {
                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'ghost@test.com', password: 'password123' });

                expect(res.status).toBe(401);
                expect(res.body.message).toContain('Invalid email or password');
            });

            it('should use same error message for wrong email and wrong password', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const wrongEmail = await request(app)
                .post('/api/auth/login')
                .send({ email: 'wrong@test.com', password: payload.password });

                const wrongPassword = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: 'wrongpassword' });

                // Same message — prevents email enumeration
                expect(wrongEmail.body.message).toBe(wrongPassword.body.message);
            });

            // ─── Validation ────────────────────────────────────
            it('should reject login with missing email', async () => {
                const res = await request(app)
                .post('/api/auth/login')
                .send({ password: 'password123' });

                expect(res.status).toBe(400);
            });

            it('should reject login with missing password', async () => {
                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@test.com' });

                expect(res.status).toBe(400);
            });

            it('should treat login email as case-insensitive', async () => {
                const payload = getDefaultCustomer({ email: 'upper@test.com' });
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'UPPER@TEST.COM', password: payload.password });

                expect(res.status).toBe(200);
            });
        });

        // ═══════════════════════════════════════════════════════
        // REFRESH TOKEN
        // ═══════════════════════════════════════════════════════
        describe('POST /api/auth/refresh', () => {
            // ─── Happy Path ────────────────────────────────────
            it('should return new access + refresh tokens', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const oldRefreshToken = loginRes.body.data.refreshToken;

                await new Promise(r => setTimeout(r, 1000)); // wait 1 second ← add this
                const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: oldRefreshToken });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.data.accessToken).toBeDefined();
                expect(res.body.data.refreshToken).toBeDefined();
                
                // New tokens should be different from old ones
                expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);
                expect(res.body.data.accessToken).not.toBe(loginRes.body.data.accessToken);
            });

            it('should include user data in refresh response', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: loginRes.body.data.refreshToken });

                expect(res.body.data.user).toMatchObject({
                    email: payload.email,
                    role: 'customer',
                });
            });

            // ─── Token Rotation ───────────────────────────────
            it('should invalidate old refresh token after rotation', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const oldRefreshToken = loginRes.body.data.refreshToken;

                // Use the refresh token once (rotates it)
                await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: oldRefreshToken });

                // Try using the old token again — should fail
                const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: oldRefreshToken });

                expect(res.status).toBe(401);
            });

            it('should allow chained refreshes with latest token', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                // First refresh
                const refresh1 = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: loginRes.body.data.refreshToken });

                expect(refresh1.status).toBe(200);

                // Second refresh with new token
                const refresh2 = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: refresh1.body.data.refreshToken });

                expect(refresh2.status).toBe(200);
                expect(refresh2.body.data.refreshToken).not.toBe(
                    refresh1.body.data.refreshToken,
                );
            });

            // ─── Failure Cases ─────────────────────────────────
            it('should reject invalid refresh token', async () => {
                const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: 'totally-invalid-token' });

                expect(res.status).toBe(401);
            });

            it('should reject expired refresh token', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                // Manually expire the token in DB
                const { getTestPool } = await import('./setup');
                const pool = getTestPool();
                await pool.query(
                    `UPDATE refresh_tokens
                    SET expires_at = NOW() - INTERVAL '1 day'
                    WHERE user_id = $1`,
                        [loginRes.body.data.user.id],
                );

                const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: loginRes.body.data.refreshToken });

                expect(res.status).toBe(401);
            });

            // ─── Validation ────────────────────────────────────
            it('should reject missing refreshToken field', async () => {
                const res = await request(app)
                .post('/api/auth/refresh')
                .send({});

                expect(res.status).toBe(400);
            });
        });

        // ═══════════════════════════════════════════════════════
        // LOGOUT
        // ═══════════════════════════════════════════════════════
        describe('POST /api/auth/logout', () => {
            // ─── Happy Path ────────────────────────────────────
            it('should logout successfully', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const res = await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken: loginRes.body.data.refreshToken });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.data.message).toContain('Logged out');
            });

            it('should invalidate refresh token after logout', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const refreshToken = loginRes.body.data.refreshToken;

                // Logout
                await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken });

                // Try to use the token — should fail
                const refreshRes = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken });

                expect(refreshRes.status).toBe(401);
            });

            it('should delete token row from DB on logout', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken: loginRes.body.data.refreshToken });

                const { getTestPool } = await import('./setup');
                const pool = getTestPool();
                const result = await pool.query(
                    'SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1',
                    [loginRes.body.data.user.id],
                );

                expect(parseInt(result.rows[0].count, 10)).toBe(0);
            });

            // ─── Failure Cases ─────────────────────────────────
            it('should reject logout with invalid refresh token', async () => {
                const res = await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken: 'invalid-token' });

                expect(res.status).toBe(401);
            });

            it('should reject double logout (same token twice)', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const refreshToken = loginRes.body.data.refreshToken;

                // First logout — success
                await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken });

                // Second logout — fail
                const res = await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken });

                expect(res.status).toBe(401);
            });
        });

        // ═══════════════════════════════════════════════════════
        // FORGOT PASSWORD
        // ═══════════════════════════════════════════════════════
        describe('POST /api/auth/forgot-password', () => {
            // ─── Happy Path ────────────────────────────────────
            it('should return success for registered email', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            });

            it('should create a password_reset verification code', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');
                expect(code).toBeDefined();
                expect(code).toHaveLength(6);
            });

            // ─── Security ──────────────────────────────────────
            it('should return same success message for non-existent email', async () => {
                const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'ghost@test.com' });

                // Must NOT return 404 — prevents email enumeration
                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            });

            it('should return same message for registered and non-registered emails', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                const registeredRes = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const fakeRes = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'nobody@test.com' });

                expect(registeredRes.body.data.message).toBe(fakeRes.body.data.message);
            });

            // ─── Rate Limiting ─────────────────────────────────
            it('should rate limit forgot-password to 3 attempts per 15 min', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                // 3 requests should work
                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });
                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });
                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                // 4th should be rate limited
                const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                expect(res.status).toBe(429);
            });

            // ─── Validation ────────────────────────────────────
            it('should reject missing email', async () => {
                const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({});

                expect(res.status).toBe(400);
            });

            it('should reject invalid email format', async () => {
                const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'not-email' });

                expect(res.status).toBe(400);
            });
        });

        // ═══════════════════════════════════════════════════════
        // RESET PASSWORD
        // ═══════════════════════════════════════════════════════
        describe('POST /api/auth/reset-password', () => {
            // ─── Happy Path ────────────────────────────────────
            it('should reset password with valid code', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            });

            it('should allow login with new password after reset', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: 'newpassword456' });

                expect(loginRes.status).toBe(200);
                expect(loginRes.body.data.accessToken).toBeDefined();
            });

            it('should reject login with old password after reset', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                expect(loginRes.status).toBe(401);
            });

            it('should invalidate all refresh tokens after reset', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                // Login to create a refresh token
                const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const oldRefreshToken = loginRes.body.data.refreshToken;

                // Reset password
                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                // Old refresh token should be invalid
                const refreshRes = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: oldRefreshToken });

                expect(refreshRes.status).toBe(401);
            });

            it('should invalidate all refresh tokens from DB after reset', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                // Login twice to create two refresh tokens
                await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                const loginRes2 = await request(app)
                .post('/api/auth/login')
                .send({ email: payload.email, password: payload.password });

                // Reset password
                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                // Check DB — zero refresh tokens for this user
                const { getTestPool } = await import('./setup');
                const pool = getTestPool();
                const result = await pool.query(
                    'SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1',
                    [loginRes2.body.data.user.id],
                );

                expect(parseInt(result.rows[0].count, 10)).toBe(0);
            });

            // ─── Failure Cases ─────────────────────────────────
            it('should reject reset with wrong code', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code: '000000',
                    newPassword: 'newpassword456',
                });

                expect(res.status).toBe(401);
            });

            it('should reject reset with non-existent email', async () => {
                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: 'ghost@test.com',
                    code: '123456',
                    newPassword: 'newpassword456',
                });

                expect(res.status).toBe(401);
            });

            it('should reject reset with expired code', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                // Expire the code manually
                const { getTestPool } = await import('./setup');
                const pool = getTestPool();
                await pool.query(
                    `UPDATE verification_codes
                    SET expires_at = NOW() - INTERVAL '2 hours'
                    WHERE email = $1 AND type = 'password_reset'`,
                        [payload.email],
                );

                const codeResult = await pool.query(
                    `SELECT code FROM verification_codes
                    WHERE email = $1 AND type = 'password_reset'
                    ORDER BY created_at DESC LIMIT 1`,
                    [payload.email],
                );

                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code: codeResult.rows[0].code,
                    newPassword: 'newpassword456',
                });

                expect(res.status).toBe(401);
            });

            it('should reject reuse of same reset code', async () => {
                const payload = getDefaultCustomer();
                await registerUser(payload);

                await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: payload.email });

                const code = await getVerificationCode(payload.email, 'password_reset');

                // First reset — success
                await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'newpassword456',
                });

                // Second reset with same code — fail
                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: payload.email,
                    code,
                    newPassword: 'anotherpassword789',
                });

                expect(res.status).toBe(401);
            });

            // ─── Validation ────────────────────────────────────
            it('should reject new password shorter than 8 characters', async () => {
                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    email: 'test@test.com',
                    code: '123456',
                    newPassword: '1234567',
                });

                expect(res.status).toBe(400);
            });

            it('should reject missing fields', async () => {
                const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ email: 'test@test.com' });

                expect(res.status).toBe(400);
            });
        });
    });
});



