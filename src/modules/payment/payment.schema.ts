import { z } from 'zod';
import {
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  PAYMENT_STATUS_VALUES,
} from '../../config/constants';

// ─── Initiate Payment ─────────────────────────────────────

export const initiatePaymentSchema = z.object({
  amount: z.coerce
    .number({
      invalid_type_error: 'Amount must be a number',
    })
    .positive('Amount must be positive')
    .min(MIN_PAYMENT_AMOUNT, `Minimum amount is NPR ${MIN_PAYMENT_AMOUNT}`)
    .max(MAX_PAYMENT_AMOUNT, `Maximum amount is NPR ${MAX_PAYMENT_AMOUNT}`),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

// ─── Payment History Query ────────────────────────────────

export const paymentHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(PAYMENT_STATUS_VALUES).optional(),
});

export type PaymentHistoryQueryInput = z.infer<typeof paymentHistoryQuerySchema>;
