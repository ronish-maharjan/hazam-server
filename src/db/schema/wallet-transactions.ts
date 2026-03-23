import {
  pgTable,
  uuid,
  decimal,
  varchar,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { WALLET_TX_TYPE_VALUES } from '../../config/constants';
import { wallets } from './wallets';

export const walletTxTypeEnum = pgEnum('wallet_tx_type', WALLET_TX_TYPE_VALUES);

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  type: walletTxTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  referenceId: uuid('reference_id'),
  balanceBefore: decimal('balance_before', { precision: 10, scale: 2 })
    .notNull(),
  balanceAfter: decimal('balance_after', { precision: 10, scale: 2 })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});
