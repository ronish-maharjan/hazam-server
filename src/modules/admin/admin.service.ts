import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  coupons,
  users,
  bookings,
  walletTransactions,
} from '../../db/schema/index';
import { generateCouponCode } from '../../utils/coupon-code';
import { formatMoney } from '../../utils/decimal';
import type {
  GenerateCouponsInput,
  ListCouponsQueryInput,
  ListUsersQueryInput,
} from './admin.schema';
import type { CouponStatus } from '../../config/constants';

// ─── Generate Coupon Batch ────────────────────────────────

export async function generateCoupons(input: GenerateCouponsInput) {
  const generatedCodes: string[] = [];
  const maxRetries = 3;

  for (let i = 0; i < input.quantity; i++) {
    let code = '';
    let inserted = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      code = generateCouponCode();

      try {
        await db.insert(coupons).values({
          code,
          denomination: input.denomination,
        });

        inserted = true;
        break;
      } catch (error) {
        // Unique constraint violation — retry with a new code
        const pgError = error as { code?: string };
        if (pgError.code === '23505') {
          continue;
        }
        throw error;
      }
    }

    if (!inserted) {
      throw new Error(
        `Failed to generate unique coupon code after ${maxRetries} attempts`,
      );
    }

    generatedCodes.push(code);
  }

  return {
    denomination: input.denomination,
    quantity: generatedCodes.length,
    codes: generatedCodes,
  };
}

// ─── List Coupons ─────────────────────────────────────────

export async function listCoupons(query: ListCouponsQueryInput) {
  // Build conditions
  const conditions = [];

  if (query.status) {
    conditions.push(eq(coupons.status, query.status as CouponStatus));
  }

  if (query.denomination) {
    conditions.push(eq(coupons.denomination, query.denomination));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coupons)
    .where(whereClause);

  const total = countResult.count;

  // Fetch paginated
  const offset = (query.page - 1) * query.limit;

  const couponRows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      denomination: coupons.denomination,
      status: coupons.status,
      redeemedBy: coupons.redeemedBy,
      redeemedAt: coupons.redeemedAt,
      createdAt: coupons.createdAt,
    })
    .from(coupons)
    .where(whereClause)
    .orderBy(desc(coupons.createdAt))
    .limit(query.limit)
    .offset(offset);

  return {
    coupons: couponRows,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── List Users ───────────────────────────────────────────

export async function listUsers(query: ListUsersQueryInput) {
  const conditions = [];

  if (query.role) {
    conditions.push(eq(users.role, query.role));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(whereClause);

  const total = countResult.count;

  // Fetch paginated
  const offset = (query.page - 1) * query.limit;

  const userRows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: users.role,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(query.limit)
    .offset(offset);

  return {
    users: userRows,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Dashboard Stats ──────────────────────────────────────

export async function getStats() {
  const [userStats] = await db
    .select({
      totalUsers: sql<number>`count(*)::int`,
      totalCustomers: sql<number>`count(*) filter (where role = 'customer')::int`,
      totalBarbers: sql<number>`count(*) filter (where role = 'barber')::int`,
    })
    .from(users);

  const [bookingStats] = await db
    .select({
      totalBookings: sql<number>`count(*)::int`,
      pendingBookings: sql<number>`count(*) filter (where status = 'pending')::int`,
      confirmedBookings: sql<number>`count(*) filter (where status = 'confirmed')::int`,
      completedBookings: sql<number>`count(*) filter (where status = 'completed')::int`,
      cancelledBookings: sql<number>`count(*) filter (where status = 'cancelled')::int`,
    })
    .from(bookings);

  const [couponStats] = await db
    .select({
      totalCoupons: sql<number>`count(*)::int`,
      unusedCoupons: sql<number>`count(*) filter (where status = 'unused')::int`,
      redeemedCoupons: sql<number>`count(*) filter (where status = 'redeemed')::int`,
    })
    .from(coupons);

  const [txStats] = await db
    .select({
      totalCredits: sql<string>`coalesce(sum(amount) filter (where type = 'credit'), 0)`,
      totalDebits: sql<string>`coalesce(sum(amount) filter (where type = 'debit'), 0)`,
    })
    .from(walletTransactions);

  return {
    users: userStats,
    bookings: bookingStats,
    coupons: couponStats,
    transactions: {
      totalCredits: formatMoney(txStats.totalCredits),
      totalDebits: formatMoney(txStats.totalDebits),
    },
  };
}
