import { relations } from 'drizzle-orm';
import { users } from './users';
import { verificationCodes } from './verification-codes';
import { refreshTokens } from './refresh-tokens';
import { wallets } from './wallets';
import { walletTransactions } from './wallet-transactions';
import { payments } from './payments';
import { shops } from './shops';
import { services } from './services';
import { bookings } from './bookings';
import { reviews } from './reviews';

// ─── Users ────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  verificationCodes: many(verificationCodes, {
    relationName: 'user_verification_codes',
  }),
  refreshTokens: many(refreshTokens, {
    relationName: 'user_refresh_tokens',
  }),
  wallet: many(wallets, {
    relationName: 'user_wallet',
  }),
  payments: many(payments, {
    relationName: 'user_payments',
  }),
  shops: many(shops, {
    relationName: 'barber_shops',
  }),
  bookings: many(bookings, {
    relationName: 'customer_bookings',
  }),
  reviews: many(reviews, {
    relationName: 'customer_reviews',
  }),
}));

// ─── Verification Codes ───────────────────────────────────
export const verificationCodesRelations = relations(
  verificationCodes,
  ({ one }) => ({
    user: one(users, {
      fields: [verificationCodes.userId],
      references: [users.id],
      relationName: 'user_verification_codes',
    }),
  }),
);

// ─── Refresh Tokens ───────────────────────────────────────
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
    relationName: 'user_refresh_tokens',
  }),
}));

// ─── Wallets ──────────────────────────────────────────────
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
    relationName: 'user_wallet',
  }),
  transactions: many(walletTransactions, {
    relationName: 'wallet_transactions',
  }),
}));

// ─── Wallet Transactions ──────────────────────────────────
export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [walletTransactions.walletId],
      references: [wallets.id],
      relationName: 'wallet_transactions',
    }),
    payment: one(payments, {
      fields: [walletTransactions.id],
      references: [payments.walletTransactionId],
      relationName: 'payment_wallet_transaction',
    }),
  }),
);

// ─── Payments ─────────────────────────────────────────────
export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
    relationName: 'user_payments',
  }),
  walletTransaction: one(walletTransactions, {
    fields: [payments.walletTransactionId],
    references: [walletTransactions.id],
    relationName: 'payment_wallet_transaction',
  }),
}));

// ─── Shops ────────────────────────────────────────────────
export const shopsRelations = relations(shops, ({ one, many }) => ({
  barber: one(users, {
    fields: [shops.barberId],
    references: [users.id],
    relationName: 'barber_shops',
  }),
  services: many(services, {
    relationName: 'shop_services',
  }),
  bookings: many(bookings, {
    relationName: 'shop_bookings',
  }),
  reviews: many(reviews, {
    relationName: 'shop_reviews',
  }),
}));

// ─── Services ─────────────────────────────────────────────
export const servicesRelations = relations(services, ({ one, many }) => ({
  shop: one(shops, {
    fields: [services.shopId],
    references: [shops.id],
    relationName: 'shop_services',
  }),
  bookings: many(bookings, {
    relationName: 'service_bookings',
  }),
}));

// ─── Bookings ─────────────────────────────────────────────
export const bookingsRelations = relations(bookings, ({ one }) => ({
  customer: one(users, {
    fields: [bookings.customerId],
    references: [users.id],
    relationName: 'customer_bookings',
  }),
  shop: one(shops, {
    fields: [bookings.shopId],
    references: [shops.id],
    relationName: 'shop_bookings',
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
    relationName: 'service_bookings',
  }),
  review: one(reviews, {
    fields: [bookings.id],
    references: [reviews.bookingId],
    relationName: 'booking_review',
  }),
}));

// ─── Reviews ──────────────────────────────────────────────
export const reviewsRelations = relations(reviews, ({ one }) => ({
  customer: one(users, {
    fields: [reviews.customerId],
    references: [users.id],
    relationName: 'customer_reviews',
  }),
  shop: one(shops, {
    fields: [reviews.shopId],
    references: [shops.id],
    relationName: 'shop_reviews',
  }),
  booking: one(bookings, {
    fields: [reviews.bookingId],
    references: [bookings.id],
    relationName: 'booking_review',
  }),
}));
