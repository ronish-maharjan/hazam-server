import { z } from 'zod';

// ─── Create Review ────────────────────────────────────────

export const createReviewSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  comment: z
    .string()
    .max(1000, 'Comment must be at most 1000 characters')
    .transform((v) => v.trim())
    .optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// ─── Update Review ────────────────────────────────────────

export const updateReviewSchema = z
  .object({
    rating: z
      .number()
      .int('Rating must be a whole number')
      .min(1, 'Rating must be between 1 and 5')
      .max(5, 'Rating must be between 1 and 5')
      .optional(),
    comment: z
      .string()
      .max(1000, 'Comment must be at most 1000 characters')
      .transform((v) => v.trim())
      .optional(),
  })
  .refine(
    (data) => data.rating !== undefined || data.comment !== undefined,
    { message: 'At least one field (rating or comment) must be provided' },
  );

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

// ─── Review ID Param ──────────────────────────────────────

export const reviewIdParamSchema = z.object({
  reviewId: z.string().uuid('Invalid review ID'),
});

export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;

// ─── Shop Reviews Query ──────────────────────────────────

export const shopReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ShopReviewsQueryInput = z.infer<typeof shopReviewsQuerySchema>;

// ─── Shop ID Param (for reviews listing) ─────────────────

export const shopIdParamSchema = z.object({
  shopId: z.string().uuid('Invalid shop ID'),
});

export type ShopIdParam = z.infer<typeof shopIdParamSchema>;
