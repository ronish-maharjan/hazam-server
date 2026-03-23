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

// ─── Coupon ───────────────────────────────────────────────
export const COUPON_STATUSES = {
  UNUSED: 'unused',
  REDEEMED: 'redeemed',
} as const;

export type CouponStatus =
  (typeof COUPON_STATUSES)[keyof typeof COUPON_STATUSES];

export const COUPON_STATUS_VALUES: [CouponStatus, ...CouponStatus[]] = [
  COUPON_STATUSES.UNUSED,
  COUPON_STATUSES.REDEEMED,
];

export const COUPON_DENOMINATIONS = [50, 100, 500] as const;
export type CouponDenomination = (typeof COUPON_DENOMINATIONS)[number];

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
