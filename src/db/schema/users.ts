import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { USER_ROLE_VALUES } from '../../config/constants';

export const userRoleEnum = pgEnum('user_role', USER_ROLE_VALUES);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 20 }),
  role: userRoleEnum('role').notNull(),
  isVerified: boolean('is_verified').notNull().default(false),
  googleId: varchar('google_id', { length: 255 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
