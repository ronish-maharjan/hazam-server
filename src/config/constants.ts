// ─── Roles ────────────────────────────────────────────────
export const USER_ROLES = {
  CUSTOMER: 'customer',
  BARBER: 'barber',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_VALUES: [UserRole, ...UserRole[]] = [
  USER_ROLES.CUSTOMER,
  USER_ROLES.BARBER,
  USER_ROLES.ADMIN,
];

// ─── Booking Statuses ─────────────────────────────────────
export const BOOKING_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type BookingStatus =
  (typeof BOOKING_STATUSES)[keyof typeof BOOKING_STATUSES];

export const BOOKING_STATUS_VALUES: [BookingStatus, ...BookingStatus[]] = [
  BOOKING_STATUSES.PENDING,
  BOOKING_STATUSES.CONFIRMED,
  BOOKING_STATUSES.COMPLETED,
  BOOKING_STATUSES.CANCELLED,
];

// ─── Wallet ───────────────────────────────────────────────
export const WALLET_TX_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit',
} as const;

export type WalletTxType =
  (typeof WALLET_TX_TYPES)[keyof typeof WALLET_TX_TYPES];

export const WALLET_TX_TYPE_VALUES: [WalletTxType, ...WalletTxType[]] = [
  WALLET_TX_TYPES.CREDIT,
  WALLET_TX_TYPES.DEBIT,
];

// ─── Payment Statuses ─────────────────────────────────────
export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const PAYMENT_STATUS_VALUES: [PaymentStatus, ...PaymentStatus[]] = [
  PAYMENT_STATUSES.PENDING,
  PAYMENT_STATUSES.COMPLETED,
  PAYMENT_STATUSES.FAILED,
  PAYMENT_STATUSES.EXPIRED,
];

// ─── Payment Limits ───────────────────────────────────────
export const MIN_PAYMENT_AMOUNT = 50;
export const MAX_PAYMENT_AMOUNT = 10000;
export const PAYMENT_EXPIRY_MINUTES = 30;

// ─── Verification Codes ───────────────────────────────────
export const VERIFICATION_CODE_TYPES = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;

export type VerificationCodeType =
  (typeof VERIFICATION_CODE_TYPES)[keyof typeof VERIFICATION_CODE_TYPES];

export const VERIFICATION_CODE_TYPE_VALUES: [
  VerificationCodeType,
  ...VerificationCodeType[],
] = [
  VERIFICATION_CODE_TYPES.EMAIL_VERIFICATION,
  VERIFICATION_CODE_TYPES.PASSWORD_RESET,
];

// ─── Auth / Token Expiry ──────────────────────────────────
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const OTP_EXPIRY_MINUTES = 15;
export const PASSWORD_RESET_EXPIRY_MINUTES = 60;
export const RESEND_OTP_MAX_ATTEMPTS = 3;
export const RESEND_OTP_WINDOW_MINUTES = 15;

// ─── Pagination ───────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 10;

// ─── Geo ──────────────────────────────────────────────────
export const EARTH_RADIUS_KM = 6371;
