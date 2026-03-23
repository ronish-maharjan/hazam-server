import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { shops } from './shops';
import { bookings } from './bookings';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    shopIdIdx: index('reviews_shop_id_idx').on(table.shopId),
    customerIdIdx: index('reviews_customer_id_idx').on(table.customerId),
  }),
);
