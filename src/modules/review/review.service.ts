import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  reviews,
  bookings,
  shops,
  users,
} from '../../db/schema/index';
import { BOOKING_STATUSES } from '../../config/constants';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../errors/index';
import type {
  CreateReviewInput,
  UpdateReviewInput,
  ShopReviewsQueryInput,
} from './review.schema';

// ─── Create Review ────────────────────────────────────────

export async function createReview(
  customerId: string,
  input: CreateReviewInput,
) {
  // 1. Find booking and verify ownership
  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.id, input.bookingId),
      eq(bookings.customerId, customerId),
    ),
  });

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // 2. Only completed bookings can be reviewed
  if (booking.status !== BOOKING_STATUSES.COMPLETED) {
    throw new ForbiddenError(
      `Cannot review a booking that is "${booking.status}". Only completed bookings can be reviewed.`,
    );
  }

  // 3. Check if already reviewed
  const existingReview = await db.query.reviews.findFirst({
    where: eq(reviews.bookingId, input.bookingId),
  });

  if (existingReview) {
    throw new ConflictError('You have already reviewed this booking');
  }

  // 4. Create review
  const [review] = await db
    .insert(reviews)
    .values({
      customerId,
      shopId: booking.shopId,
      bookingId: input.bookingId,
      rating: input.rating,
      comment: input.comment || null,
    })
    .returning({
      id: reviews.id,
      customerId: reviews.customerId,
      shopId: reviews.shopId,
      bookingId: reviews.bookingId,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
    });

  return review;
}

// ─── Update Review ────────────────────────────────────────

export async function updateReview(
  customerId: string,
  reviewId: string,
  input: UpdateReviewInput,
) {
  // Find review and verify ownership
  const review = await db.query.reviews.findFirst({
    where: and(
      eq(reviews.id, reviewId),
      eq(reviews.customerId, customerId),
    ),
  });

  if (!review) {
    throw new NotFoundError('Review not found');
  }

  const updateData: Record<string, unknown> = {};

  if (input.rating !== undefined) updateData.rating = input.rating;
  if (input.comment !== undefined) updateData.comment = input.comment;

  const [updated] = await db
    .update(reviews)
    .set(updateData)
    .where(eq(reviews.id, reviewId))
    .returning({
      id: reviews.id,
      customerId: reviews.customerId,
      shopId: reviews.shopId,
      bookingId: reviews.bookingId,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
    });

  return updated;
}

// ─── Delete Review ────────────────────────────────────────

export async function deleteReview(customerId: string, reviewId: string) {
  const review = await db.query.reviews.findFirst({
    where: and(
      eq(reviews.id, reviewId),
      eq(reviews.customerId, customerId),
    ),
  });

  if (!review) {
    throw new NotFoundError('Review not found');
  }

  await db.delete(reviews).where(eq(reviews.id, reviewId));

  return { message: 'Review deleted successfully' };
}

// ─── Get Shop Reviews (Public) ───────────────────────────

export async function getShopReviews(
  shopId: string,
  query: ShopReviewsQueryInput,
) {
  // Verify shop exists
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });

  if (!shop) {
    throw new NotFoundError('Shop not found');
  }

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.shopId, shopId));

  const total = countResult.count;

  // Fetch paginated reviews with customer name
  const offset = (query.page - 1) * query.limit;

  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
      customerName: users.fullName,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.customerId, users.id))
    .where(eq(reviews.shopId, shopId))
    .orderBy(desc(reviews.createdAt))
    .limit(query.limit)
    .offset(offset);

  // Get rating stats
  const [stats] = await db
    .select({
      averageRating: sql<string>`coalesce(round(avg(${reviews.rating}), 1)::text, '0')`,
      totalReviews: sql<number>`count(*)::int`,
      fiveStars: sql<number>`count(*) filter (where ${reviews.rating} = 5)::int`,
      fourStars: sql<number>`count(*) filter (where ${reviews.rating} = 4)::int`,
      threeStars: sql<number>`count(*) filter (where ${reviews.rating} = 3)::int`,
      twoStars: sql<number>`count(*) filter (where ${reviews.rating} = 2)::int`,
      oneStar: sql<number>`count(*) filter (where ${reviews.rating} = 1)::int`,
    })
    .from(reviews)
    .where(eq(reviews.shopId, shopId));

  return {
    stats: {
      averageRating: parseFloat(stats.averageRating),
      totalReviews: stats.totalReviews,
      breakdown: {
        5: stats.fiveStars,
        4: stats.fourStars,
        3: stats.threeStars,
        2: stats.twoStars,
        1: stats.oneStar,
      },
    },
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customerName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Get Customer's Reviews ──────────────────────────────

export async function getCustomerReviews(
  customerId: string,
  query: ShopReviewsQueryInput,
) {
  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.customerId, customerId));

  const total = countResult.count;

  // Fetch paginated reviews with shop name
  const offset = (query.page - 1) * query.limit;

  const reviewRows = await db
    .select({
      id: reviews.id,
      shopId: reviews.shopId,
      bookingId: reviews.bookingId,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
      shopName: shops.shopName,
    })
    .from(reviews)
    .innerJoin(shops, eq(reviews.shopId, shops.id))
    .where(eq(reviews.customerId, customerId))
    .orderBy(desc(reviews.createdAt))
    .limit(query.limit)
    .offset(offset);

  return {
    reviews: reviewRows.map((r) => ({
      id: r.id,
      shopId: r.shopId,
      bookingId: r.bookingId,
      rating: r.rating,
      comment: r.comment,
      shopName: r.shopName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
