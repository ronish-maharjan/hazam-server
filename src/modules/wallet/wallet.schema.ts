import { z } from 'zod';

// ─── Redeem Coupon ────────────────────────────────────────

export const redeemCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Coupon code is required')
    .max(20, 'Coupon code is too long')
    .transform((v) => v.toUpperCase().trim()),
});

export type RedeemCouponInput = z.infer<typeof redeemCouponSchema>;

// ─── Wallet Transaction History Query ─────────────────────

export const walletTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: z.enum(['credit', 'debit']).optional(),
});

export type WalletTransactionsQueryInput = z.infer<typeof walletTransactionsQuerySchema>;
