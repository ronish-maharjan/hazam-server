import {
  pgTable,
  uuid,
  decimal,
  varchar,
  timestamp,
  pgEnum,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { PAYMENT_STATUS_VALUES } from '../../config/constants';
import { users } from './users';
import { walletTransactions } from './wallet-transactions';

export const paymentStatusEnum = pgEnum(
  'payment_status',
  PAYMENT_STATUS_VALUES,
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Amount the user wants to add to wallet
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),

    // Our unique reference sent to eSewa (e.g. "HAZ-1737012345-a1b2")
    esewaTransactionUuid: varchar('esewa_transaction_uuid', {
      length: 100,
    })
      .notNull()
      .unique(),

    // eSewa merchant code used for this payment
    productCode: varchar('product_code', { length: 50 }).notNull(),

    // Payment lifecycle status
    status: paymentStatusEnum('status').notNull().default('pending'),

    // eSewa's transaction code (filled after successful payment, e.g. "EPAY-xxx")
    esewaTransactionCode: varchar('esewa_transaction_code', {
      length: 100,
    }),

    // Full eSewa response stored for audit/debugging
    esewaResponse: jsonb('esewa_response').$type<Record<string, unknown>>(),

    // Link to the wallet transaction created after credit
    walletTransactionId: uuid('wallet_transaction_id').references(
      () => walletTransactions.id,
      { onDelete: 'set null' },
    ),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index('payments_user_id_idx').on(table.userId),
    statusIdx: index('payments_status_idx').on(table.status),
  }),
);
