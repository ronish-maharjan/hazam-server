import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { COUPON_STATUS_VALUES } from '../../config/constants';
import { users } from './users';

export const couponStatusEnum = pgEnum('coupon_status', COUPON_STATUS_VALUES);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    denomination: integer('denomination').notNull(),
    status: couponStatusEnum('status').notNull().default('unused'),
    redeemedBy: uuid('redeemed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index('coupons_status_idx').on(table.status),
    codeIdx: index('coupons_code_idx').on(table.code),
  }),
);
