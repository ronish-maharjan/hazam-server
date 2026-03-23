import {
  pgTable,
  uuid,
  varchar,
  decimal,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { shops } from './shops';

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    serviceName: varchar('service_name', { length: 255 }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    shopIdIdx: index('services_shop_id_idx').on(table.shopId),
  }),
);
