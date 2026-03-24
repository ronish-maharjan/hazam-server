import { z } from 'zod';
import { COUPON_DENOMINATIONS } from '../../config/constants';

// ─── Generate Coupons ─────────────────────────────────────

export const generateCouponsSchema = z.object({
  denomination: z.coerce
    .number()
    .refine(
      (val): val is (typeof COUPON_DENOMINATIONS)[number] =>
        (COUPON_DENOMINATIONS as readonly number[]).includes(val),
      {
        message: `Denomination must be one of: ${COUPON_DENOMINATIONS.join(', ')}`,
      },
    ),
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(500, 'Maximum 500 coupons per batch'),
});

export type GenerateCouponsInput = z.infer<typeof generateCouponsSchema>;

// ─── List Coupons Query ───────────────────────────────────

export const listCouponsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['unused', 'redeemed']).optional(),
  denomination: z.coerce
    .number()
    .refine(
      (val): val is (typeof COUPON_DENOMINATIONS)[number] =>
        (COUPON_DENOMINATIONS as readonly number[]).includes(val),
      {
        message: `Denomination must be one of: ${COUPON_DENOMINATIONS.join(', ')}`,
      },
    )
    .optional(),
});

export type ListCouponsQueryInput = z.infer<typeof listCouponsQuerySchema>;

// ─── List Users Query ─────────────────────────────────────

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  role: z.enum(['customer', 'barber', 'admin']).optional(),
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
