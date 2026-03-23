import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { VERIFICATION_CODE_TYPE_VALUES } from '../../config/constants';
import { users } from './users';

export const verificationCodeTypeEnum = pgEnum(
  'verification_code_type',
  VERIFICATION_CODE_TYPE_VALUES,
);

export const verificationCodes = pgTable(
  'verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    code: varchar('code', { length: 6 }).notNull(),
    type: verificationCodeTypeEnum('type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailTypeIdx: index('verification_codes_email_type_idx').on(
      table.email,
      table.type,
    ),
  }),
);
