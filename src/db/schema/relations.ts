import { relations } from 'drizzle-orm';
import { users } from './users';
import { verificationCodes } from './verification-codes';
import { refreshTokens } from './refresh-tokens';
import { wallets } from './wallets';
import { walletTransactions } from './wallet-transactions';
import { coupons } from './coupons';
import { shops } from './shops';
import { services } from './services';
import { bookings } from './bookings';
import { reviews } from './reviews';

// ─── Users ────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  shop: one(shops, {
    fields: [users.id],
    references: [shops.barberId],
  }),
  verificationCodes: many(verificationCodes),
  refreshTokens: many(refreshTokens),
  bookings: many(bookings),
  reviews: many(reviews),
  redeemedCoupons: many(coupons),
}));

// ─── Verification Codes ──────────────────────────────────
export const verificationCodesRelations = relations(
  verificationCodes,
  ({ one }) => ({
    user: one(users, {
      fields: [verificationCodes.userId],
      references: [users.id],
    }),
  }),
);

// ─── Refresh Tokens ──────────────────────────────────────
export const refreshTokensRelations = relations(
  refreshTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [refreshTokens.userId],
      references: [users.id],
    }),
  }),
);

// ─── Wallets ─────────────────────────────────────────────
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  transactions: many(walletTransactions),
}));

// ─── Wallet Transactions ─────────────────────────────────
export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [walletTransactions.walletId],
      references: [wallets.id],
    }),
  }),
);

// ─── Coupons ─────────────────────────────────────────────
export const couponsRelations = relations(coupons, ({ one }) => ({
  redeemedByUser: one(users, {
    fields: [coupons.redeemedBy],
    references: [users.id],
  }),
}));

// ─── Shops ───────────────────────────────────────────────
export const shopsRelations = relations(shops, ({ one, many }) => ({
  barber: one(users, {
    fields: [shops.barberId],
    references: [users.id],
  }),
  services: many(services),
  bookings: many(bookings),
  reviews: many(reviews),
}));

// ─── Services ────────────────────────────────────────────
export const servicesRelations = relations(services, ({ one, many }) => ({
  shop: one(shops, {
    fields: [services.shopId],
    references: [shops.id],
  }),
  bookings: many(bookings),
}));

// ─── Bookings ────────────────────────────────────────────
export const bookingsRelations = relations(bookings, ({ one }) => ({
  customer: one(users, {
    fields: [bookings.customerId],
    references: [users.id],
  }),
  shop: one(shops, {
    fields: [bookings.shopId],
    references: [shops.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
  review: one(reviews, {
    fields: [bookings.id],
    references: [reviews.bookingId],
  }),
}));

// ─── Reviews ─────────────────────────────────────────────
export const reviewsRelations = relations(reviews, ({ one }) => ({
  customer: one(users, {
    fields: [reviews.customerId],
    references: [users.id],
  }),
  shop: one(shops, {
    fields: [reviews.shopId],
    references: [shops.id],
  }),
  booking: one(bookings, {
    fields: [reviews.bookingId],
    references: [bookings.id],
  }),
}));
