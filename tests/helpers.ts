import request from 'supertest';
import app from '../src/app';
import { getTestPool } from './setup';

// ─── DB Cleanup ──────────────────────────────────────────
// Truncates all tables in correct order (respects FK constraints)
export async function cleanupDatabase() {
  const pool = getTestPool();

  await pool.query(`
    TRUNCATE TABLE
      reviews,
      bookings,
      wallet_transactions,
      coupons,
      services,
      shops,
      wallets,
      verification_codes,
      refresh_tokens,
      users
    CASCADE
  `);
}

// ─── Register Helper ─────────────────────────────────────
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  role: 'customer' | 'barber';
}

const DEFAULT_CUSTOMER: RegisterPayload = {
  fullName: 'Test Customer',
  email: 'customer@test.com',
  password: 'password123',
  phoneNumber: '+977-9812345678',
  role: 'customer',
};

const DEFAULT_BARBER: RegisterPayload = {
  fullName: 'Test Barber',
  email: 'barber@test.com',
  password: 'password123',
  phoneNumber: '+977-9887654321',
  role: 'barber',
};

export function getDefaultCustomer(overrides?: Partial<RegisterPayload>): RegisterPayload {
  return { ...DEFAULT_CUSTOMER, ...overrides };
}

export function getDefaultBarber(overrides?: Partial<RegisterPayload>): RegisterPayload {
  return { ...DEFAULT_BARBER, ...overrides };
}

export async function registerUser(payload?: Partial<RegisterPayload>) {
  const data = getDefaultCustomer(payload);
  return request(app).post('/api/auth/register').send(data);
}

export async function registerBarber(payload?: Partial<RegisterPayload>) {
  const data = getDefaultBarber(payload);
  return request(app).post('/api/auth/register').send(data);
}

// ─── OTP Helper (read from DB since emails are suppressed) ──
export async function getVerificationCode(
  email: string,
  type: 'email_verification' | 'password_reset' = 'email_verification',
): Promise<string> {
  const pool = getTestPool();
  const result = await pool.query(
    `SELECT code FROM verification_codes
     WHERE email = $1 AND type = $2 AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email, type],
  );

  if (result.rows.length === 0) {
    throw new Error(`No verification code found for ${email} (${type})`);
  }

  return result.rows[0].code;
}

// ─── Verify + Login Helper (full flow) ───────────────────
export async function registerAndVerify(payload?: Partial<RegisterPayload>) {
  const data = getDefaultCustomer(payload);
  await registerUser(data);

  const code = await getVerificationCode(data.email);
  await request(app)
    .post('/api/auth/verify-email')
    .send({ email: data.email, code });

  return data;
}

export async function registerVerifyAndLogin(payload?: Partial<RegisterPayload>) {
  const data = await registerAndVerify(payload);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: data.email, password: data.password });

  return {
    user: data,
    accessToken: loginRes.body.data.accessToken as string,
    refreshToken: loginRes.body.data.refreshToken as string,
  };
}
