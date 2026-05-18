import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import { users, bookings, walletTransactions, payments } from '../../db/schema/index';
import { formatMoney } from '../../utils/decimal';
import type { ListUsersQueryInput } from './admin.schema';

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

  // ✅ Replaced coupon stats with payment stats
  const [paymentStats] = await db
    .select({
      totalPayments: sql<number>`count(*)::int`,
      completedPayments: sql<number>`count(*) filter (where status = 'completed')::int`,
      pendingPayments: sql<number>`count(*) filter (where status = 'pending')::int`,
      failedPayments: sql<number>`count(*) filter (where status = 'failed')::int`,
      totalAmountLoaded: sql<string>`coalesce(sum(amount) filter (where status = 'completed'), 0)`,
    })
    .from(payments);

  const [txStats] = await db
    .select({
      totalCredits: sql<string>`coalesce(sum(amount) filter (where type = 'credit'), 0)`,
      totalDebits: sql<string>`coalesce(sum(amount) filter (where type = 'debit'), 0)`,
    })
    .from(walletTransactions);

  return {
    users: userStats,
    bookings: bookingStats,
    payments: {
      ...paymentStats,
      totalAmountLoaded: formatMoney(paymentStats.totalAmountLoaded),
    },
    transactions: {
      totalCredits: formatMoney(txStats.totalCredits),
      totalDebits: formatMoney(txStats.totalDebits),
    },
  };
}
