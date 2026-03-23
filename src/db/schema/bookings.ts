import {
  pgTable,
  uuid,
  date,
  time,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { BOOKING_STATUS_VALUES } from '../../config/constants';
import { users } from './users';
import { shops } from './shops';
import { services } from './services';

export const bookingStatusEnum = pgEnum(
  'booking_status',
  BOOKING_STATUS_VALUES,
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    appointmentDate: date('appointment_date', { mode: 'string' }).notNull(),
    appointmentTime: time('appointment_time').notNull(),
    endTime: time('end_time').notNull(),
    status: bookingStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    shopDateIdx: index('bookings_shop_date_idx').on(
      table.shopId,
      table.appointmentDate,
    ),
    customerIdx: index('bookings_customer_id_idx').on(table.customerId),
    statusIdx: index('bookings_status_idx').on(table.status),
  }),
);
