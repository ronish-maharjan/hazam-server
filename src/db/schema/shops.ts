import {
  pgTable,
  uuid,
  varchar,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

export interface WorkingHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  barberId: uuid('barber_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  shopName: varchar('shop_name', { length: 255 }).notNull(),
  shopPhoneNumber: varchar('shop_phone_number', { length: 20 }).notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  numberOfBarbers: integer('number_of_barbers').notNull().default(1),
  workingHours: jsonb('working_hours').$type<WorkingHours>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
