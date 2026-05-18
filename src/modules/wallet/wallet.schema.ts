import { z } from 'zod';

// ─── Wallet Transaction History Query ─────────────────────

export const walletTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: z.enum(['credit', 'debit']).optional(),
});

export type WalletTransactionsQueryInput = z.infer<
  typeof walletTransactionsQuerySchema
>;
