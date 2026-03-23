import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { env } from '../src/config/env';

const pool = new Pool({ connectionString: env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

const EXPECTED_TABLES = [
  'users',
  'verification_codes',
  'refresh_tokens',
  'wallets',
  'wallet_transactions',
  'coupons',
  'shops',
  'services',
  'bookings',
  'reviews',
];

const EXPECTED_ENUMS = [
  'user_role',
  'verification_code_type',
  'wallet_tx_type',
  'coupon_status',
  'booking_status',
];

describe('Database Schema', () => {
  // ─── Tables exist ───────────────────────────────────────
  describe('Tables', () => {
    it.each(EXPECTED_TABLES)(
      'table "%s" should exist',
      async (tableName) => {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          )`,
          [tableName],
        );
        expect(result.rows[0].exists).toBe(true);
      },
    );

    it('should have exactly 10 tables', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBe(10);
    });
  });

  // ─── Enums exist ────────────────────────────────────────
  describe('Enums', () => {
    it.each(EXPECTED_ENUMS)(
      'enum "%s" should exist',
      async (enumName) => {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM pg_type
            WHERE typname = $1
            AND typtype = 'e'
          )`,
          [enumName],
        );
        expect(result.rows[0].exists).toBe(true);
      },
    );
  });

  // ─── Critical columns ──────────────────────────────────
  describe('Column types', () => {
    it('wallets.balance should be numeric(10,2)', async () => {
      const result = await pool.query(
        `SELECT data_type, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_name = 'wallets'
         AND column_name = 'balance'`,
      );
      expect(result.rows[0].data_type).toBe('numeric');
      expect(result.rows[0].numeric_precision).toBe(10);
      expect(result.rows[0].numeric_scale).toBe(2);
    });

    it('services.price should be numeric(10,2)', async () => {
      const result = await pool.query(
        `SELECT data_type, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_name = 'services'
         AND column_name = 'price'`,
      );
      expect(result.rows[0].data_type).toBe('numeric');
      expect(result.rows[0].numeric_precision).toBe(10);
      expect(result.rows[0].numeric_scale).toBe(2);
    });

    it('shops.latitude should be double precision', async () => {
      const result = await pool.query(
        `SELECT data_type
         FROM information_schema.columns
         WHERE table_name = 'shops'
         AND column_name = 'latitude'`,
      );
      expect(result.rows[0].data_type).toBe('double precision');
    });

    it('bookings.appointment_date should be date', async () => {
      const result = await pool.query(
        `SELECT data_type
         FROM information_schema.columns
         WHERE table_name = 'bookings'
         AND column_name = 'appointment_date'`,
      );
      expect(result.rows[0].data_type).toBe('date');
    });

    it('bookings.appointment_time should be time without time zone', async () => {
      const result = await pool.query(
        `SELECT data_type
         FROM information_schema.columns
         WHERE table_name = 'bookings'
         AND column_name = 'appointment_time'`,
      );
      expect(result.rows[0].data_type).toBe('time without time zone');
    });
  });

  // ─── Unique constraints ────────────────────────────────
  describe('Unique constraints', () => {
    it('users.email should be unique', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'users'
         AND indexdef LIKE '%UNIQUE%'
         AND indexdef LIKE '%email%'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
    });

    it('wallets.user_id should be unique', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'wallets'
         AND indexdef LIKE '%UNIQUE%'
         AND indexdef LIKE '%user_id%'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
    });

    it('shops.barber_id should be unique', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'shops'
         AND indexdef LIKE '%UNIQUE%'
         AND indexdef LIKE '%barber_id%'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
    });

    it('reviews.booking_id should be unique', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'reviews'
         AND indexdef LIKE '%UNIQUE%'
         AND indexdef LIKE '%booking_id%'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
    });

    it('coupons.code should be unique', async () => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'coupons'
         AND indexdef LIKE '%UNIQUE%'
         AND indexdef LIKE '%code%'`,
      );
      expect(parseInt(result.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Foreign keys ──────────────────────────────────────
  describe('Foreign keys', () => {
    it('should have cascade delete on wallets → users', async () => {
      const result = await pool.query(
        `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON rc.constraint_name = kcu.constraint_name
         WHERE kcu.table_name = 'wallets'
         AND kcu.column_name = 'user_id'`,
      );
      expect(result.rows[0].delete_rule).toBe('CASCADE');
    });

    it('should have set null delete on coupons.redeemed_by → users', async () => {
      const result = await pool.query(
        `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON rc.constraint_name = kcu.constraint_name
         WHERE kcu.table_name = 'coupons'
         AND kcu.column_name = 'redeemed_by'`,
      );
      expect(result.rows[0].delete_rule).toBe('SET NULL');
    });
  });
});
