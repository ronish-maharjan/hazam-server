import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { pool } from '../../config/database';
import {
  wallets,
  walletTransactions,
  coupons,
} from '../../db/schema/index';
import {
  COUPON_STATUSES,
  WALLET_TX_TYPES,
} from '../../config/constants';
import {
  NotFoundError,
  ConflictError,
  PaymentRequiredError,
} from '../../errors/index';
import {
  addMoney,
  subtractMoney,
  isGreaterThanOrEqual,
  formatMoney,
} from '../../utils/decimal';
import type { RedeemCouponInput, WalletTransactionsQueryInput } from './wallet.schema';

// ─── Get Wallet Balance ───────────────────────────────────

export async function getWalletBalance(userId: string) {
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
  });

  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  return {
    id: wallet.id,
    balance: formatMoney(wallet.balance),
    updatedAt: wallet.updatedAt,
  };
}

// ─── Get Wallet Transactions ──────────────────────────────

export async function getWalletTransactions(
  userId: string,
  query: WalletTransactionsQueryInput,
) {
  // 1. Find wallet
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
  });

  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  // 2. Build conditions
  const conditions = [eq(walletTransactions.walletId, wallet.id)];

  if (query.type) {
    conditions.push(eq(walletTransactions.type, query.type));
  }

  // 3. Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTransactions)
    .where(and(...conditions));

  const total = countResult.count;

  // 4. Fetch paginated transactions
  const offset = (query.page - 1) * query.limit;

  const transactions = await db
    .select({
      id: walletTransactions.id,
      type: walletTransactions.type,
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      referenceId: walletTransactions.referenceId,
      balanceBefore: walletTransactions.balanceBefore,
      balanceAfter: walletTransactions.balanceAfter,
      createdAt: walletTransactions.createdAt,
    })
    .from(walletTransactions)
    .where(and(...conditions))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(query.limit)
    .offset(offset);

  return {
    transactions: transactions.map((tx) => ({
      ...tx,
      amount: formatMoney(tx.amount),
      balanceBefore: formatMoney(tx.balanceBefore),
      balanceAfter: formatMoney(tx.balanceAfter),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Redeem Coupon ────────────────────────────────────────

export async function redeemCoupon(userId: string, input: RedeemCouponInput) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock the coupon row (prevent double redemption)
    const couponResult = await client.query(
      `SELECT id, code, denomination, status, redeemed_by
       FROM coupons
       WHERE code = $1
       FOR UPDATE`,
      [input.code],
    );

    if (couponResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Coupon not found');
    }

    const coupon = couponResult.rows[0];

    if (coupon.status === COUPON_STATUSES.REDEEMED) {
      await client.query('ROLLBACK');
      throw new ConflictError('Coupon has already been redeemed');
    }

    // 2. Lock the wallet row
    const walletResult = await client.query(
      `SELECT id, balance
       FROM wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId],
    );

    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Wallet not found');
    }

    const wallet = walletResult.rows[0];
    const currentBalance = wallet.balance;
    const creditAmount = formatMoney(String(coupon.denomination));
    const newBalance = addMoney(currentBalance, creditAmount);

    // 3. Update wallet balance
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, wallet.id],
    );

    // 4. Mark coupon as redeemed
    await client.query(
      `UPDATE coupons
       SET status = $1, redeemed_by = $2, redeemed_at = NOW()
       WHERE id = $3`,
      [COUPON_STATUSES.REDEEMED, userId, coupon.id],
    );

    // 5. Log wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, type, amount, description, reference_id, balance_before, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        wallet.id,
        WALLET_TX_TYPES.CREDIT,
        creditAmount,
        `Coupon redemption ${coupon.code}`,
        coupon.id,
        currentBalance,
        newBalance,
      ],
    );

    await client.query('COMMIT');

    return {
      couponCode: coupon.code,
      denomination: coupon.denomination,
      creditedAmount: creditAmount,
      newBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── Credit Wallet (used by booking service) ──────────────

export async function creditWallet(
  client: import('pg').PoolClient,
  userId: string,
  amount: string,
  description: string,
  referenceId: string,
) {
  // Lock wallet
  const walletResult = await client.query(
    `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );

  if (walletResult.rows.length === 0) {
    throw new NotFoundError('Wallet not found');
  }

  const wallet = walletResult.rows[0];
  const currentBalance = wallet.balance;
  const newBalance = addMoney(currentBalance, amount);

  // Update balance
  await client.query(
    `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
    [newBalance, wallet.id],
  );

  // Log transaction
  await client.query(
    `INSERT INTO wallet_transactions
     (wallet_id, type, amount, description, reference_id, balance_before, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      wallet.id,
      WALLET_TX_TYPES.CREDIT,
      amount,
      description,
      referenceId,
      currentBalance,
      newBalance,
    ],
  );

  return { balanceBefore: currentBalance, balanceAfter: newBalance };
}

// ─── Debit Wallet (used by booking service) ───────────────

export async function debitWallet(
  client: import('pg').PoolClient,
  userId: string,
  amount: string,
  description: string,
  referenceId: string,
) {
  // Lock wallet
  const walletResult = await client.query(
    `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );

  if (walletResult.rows.length === 0) {
    throw new NotFoundError('Wallet not found');
  }

  const wallet = walletResult.rows[0];
  const currentBalance = wallet.balance;

  // Check sufficient balance
  if (!isGreaterThanOrEqual(currentBalance, amount)) {
    throw new PaymentRequiredError(
      `Insufficient wallet balance. Current: NPR ${formatMoney(currentBalance)}, Required: NPR ${formatMoney(amount)}`,
    );
  }

  const newBalance = subtractMoney(currentBalance, amount);

  // Update balance
  await client.query(
    `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
    [newBalance, wallet.id],
  );

  // Log transaction
  await client.query(
    `INSERT INTO wallet_transactions
     (wallet_id, type, amount, description, reference_id, balance_before, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      wallet.id,
      WALLET_TX_TYPES.DEBIT,
      amount,
      description,
      referenceId,
      currentBalance,
      newBalance,
    ],
  );

  return { balanceBefore: currentBalance, balanceAfter: newBalance };
}
