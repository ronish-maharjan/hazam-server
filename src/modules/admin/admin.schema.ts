import { z } from 'zod';

// ─── List Users Query ─────────────────────────────────────

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  role: z.enum(['customer', 'barber', 'admin']).optional(),
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
