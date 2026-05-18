import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { pool } from '../../config/database';
import { payments, walletTransactions } from '../../db/schema/index';
import { env } from '../../config/env';
import {
  PAYMENT_STATUSES,
  WALLET_TX_TYPES,
} from '../../config/constants';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../errors/index';
import {
  addMoney,
  formatMoney,
} from '../../utils/decimal';
import {
  buildEsewaPaymentFormData,
  decodeEsewaResponse,
  verifyEsewaSignature,
  verifyEsewaTransactionStatus,
  generateTransactionUuid,
  type EsewaSuccessResponse,
} from '../../utils/esewa';
import type {
  InitiatePaymentInput,
  PaymentHistoryQueryInput,
} from './payment.schema';


// ─── Initiate Payment ─────────────────────────────────────
export async function initiatePayment(
  userId: string,
  input: InitiatePaymentInput,
) {
  // For database: "500.00" (consistent with wallet system)
  const dbAmount = formatMoney(String(input.amount));
  
  // For eSewa: "500" (eSewa expects no forced decimals)
  const esewaAmount = String(input.amount);

  const transactionUuid = generateTransactionUuid();

  // Create payment record (uses DB format)
  const [payment] = await db
    .insert(payments)
    .values({
      userId,
      amount: dbAmount,
      esewaTransactionUuid: transactionUuid,
      productCode: env.ESEWA_MERCHANT_CODE,
      status: PAYMENT_STATUSES.PENDING,
    })
    .returning();

  // Build callback URLs
  const successUrl = `${env.BACKEND_URL}/api/payments/esewa/success`;
  const failureUrl = `${env.BACKEND_URL}/api/payments/esewa/failure`;

  // Build eSewa form data (uses eSewa format — no .00)
  const formData = buildEsewaPaymentFormData({
    amount: esewaAmount,  // "500" not "500.00"
    transactionUuid,
    successUrl,
    failureUrl,
  });

  return {
    paymentId: payment.id,
    transactionUuid,
    amount: dbAmount,
    formData,
    paymentUrl: env.ESEWA_PAYMENT_URL,
  };
}

// ─── Handle eSewa Success Callback ────────────────────────
// Called when eSewa redirects user back after successful payment

export async function handleEsewaSuccess(encodedData: string) {
  // 1. Decode the base64 response from eSewa
  let esewaResponse: EsewaSuccessResponse;
  try {
    esewaResponse = decodeEsewaResponse(encodedData);
  } catch {
    throw new Error('Invalid eSewa response data');
  }

  // 2. Verify signature (ensures response wasn't tampered)
  const isSignatureValid = verifyEsewaSignature(esewaResponse);
  if (!isSignatureValid) {
    throw new Error('Invalid eSewa signature — possible tampering detected');
  }

  // 3. Find the payment record
  const payment = await db.query.payments.findFirst({
    where: eq(payments.esewaTransactionUuid, esewaResponse.transaction_uuid),
  });

  if (!payment) {
    throw new NotFoundError('Payment record not found');
  }

  // 4. Check payment is still pending (prevent double credit)
  if (payment.status !== PAYMENT_STATUSES.PENDING) {
    throw new ConflictError(
      `Payment is already ${payment.status}. Cannot process again.`,
    );
  }

  // 5. Verify amount matches
  if (formatMoney(esewaResponse.total_amount) !== formatMoney(payment.amount)) {
    throw new ConflictError(
      'Amount mismatch between payment record and eSewa response',
    );
  }

  // 6. Server-to-server verification (the real security check)
  const statusCheck = await verifyEsewaTransactionStatus({
    transactionUuid: esewaResponse.transaction_uuid,
    totalAmount: formatMoney(payment.amount),
    productCode: env.ESEWA_MERCHANT_CODE,
  });

  if (statusCheck.status !== 'COMPLETE') {
    // Payment not actually complete on eSewa's side
    await db
      .update(payments)
      .set({
        status: PAYMENT_STATUSES.FAILED,
        esewaResponse: esewaResponse as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    throw new ConflictError(
      `eSewa transaction status: ${statusCheck.status}. Expected COMPLETE.`,
    );
  }

  // 7. All checks passed — credit wallet in a transaction
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock payment row to prevent race conditions
    const lockedPayment = await client.query(
      `SELECT id, status, user_id, amount FROM payments WHERE id = $1 FOR UPDATE`,
      [payment.id],
    );

    if (lockedPayment.rows[0].status !== PAYMENT_STATUSES.PENDING) {
      await client.query('ROLLBACK');
      throw new ConflictError(
        `Payment is already ${lockedPayment.rows[0].status}. Cannot process again.`,
      );
    }

    // Update payment status
    await client.query(
      `UPDATE payments
       SET status = $1,
           esewa_transaction_code = $2,
           esewa_response = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        PAYMENT_STATUSES.COMPLETED,
        esewaResponse.transaction_code,
        JSON.stringify(esewaResponse),
        payment.id,
      ],
    );

    // Credit wallet using existing pattern
    const walletResult = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [payment.userId],
    );

    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Wallet not found');
    }

    const wallet = walletResult.rows[0];
    const currentBalance = wallet.balance;
    const newBalance = addMoney(currentBalance, formatMoney(payment.amount));

    // Update wallet balance
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, wallet.id],
    );

    // Log wallet transaction
    const txResult = await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, type, amount, description, reference_id, balance_before, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        wallet.id,
        WALLET_TX_TYPES.CREDIT,
        formatMoney(payment.amount),
        `Wallet top-up via eSewa (${esewaResponse.transaction_code})`,
        payment.id,
        currentBalance,
        newBalance,
      ],
    );

    // Link payment to wallet transaction
    await client.query(
      `UPDATE payments SET wallet_transaction_id = $1 WHERE id = $2`,
      [txResult.rows[0].id, payment.id],
    );

    await client.query('COMMIT');

    return {
      paymentId: payment.id,
      amount: formatMoney(payment.amount),
      newBalance,
      esewaTransactionCode: esewaResponse.transaction_code,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── Handle eSewa Failure Callback ────────────────────────

export async function handleEsewaFailure(encodedData: string) {
  // Decode response to get transaction_uuid for lookup
  let esewaResponse: EsewaSuccessResponse;
  try {
    esewaResponse = decodeEsewaResponse(encodedData);
  } catch {
    // If we can't decode, we can't find the payment
    throw new Error('Invalid eSewa response data');
  }

  const payment = await db.query.payments.findFirst({
    where: eq(payments.esewaTransactionUuid, esewaResponse.transaction_uuid),
  });

  if (!payment) {
    throw new NotFoundError('Payment record not found');
  }

  // Only update if still pending
  if (payment.status === PAYMENT_STATUSES.PENDING) {
    await db
      .update(payments)
      .set({
        status: PAYMENT_STATUSES.FAILED,
        esewaResponse: esewaResponse as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
  }

  return {
    paymentId: payment.id,
    amount: formatMoney(payment.amount),
  };
}

// ─── Get Payment History ──────────────────────────────────

export async function getPaymentHistory(
  userId: string,
  query: PaymentHistoryQueryInput,
) {
  const conditions = [eq(payments.userId, userId)];

  if (query.status) {
    conditions.push(eq(payments.status, query.status));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .where(whereClause);

  const total = countResult.count;

  // Fetch paginated
  const offset = (query.page - 1) * query.limit;

  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      esewaTransactionUuid: payments.esewaTransactionUuid,
      productCode: payments.productCode,
      status: payments.status,
      esewaTransactionCode: payments.esewaTransactionCode,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .where(whereClause)
    .orderBy(desc(payments.createdAt))
    .limit(query.limit)
    .offset(offset);

  return {
    payments: paymentRows.map((p) => ({
      ...p,
      amount: formatMoney(p.amount),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
