import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { shops, services, reviews } from '../../db/schema/index';
import { NotFoundError } from '../../errors/index';
import { haversineDistance, getBoundingBox } from '../../utils/geo';
import { formatMoney } from '../../utils/decimal';
import type { NearbyShopsQueryInput } from './discovery.schema';

// ─── Nearby Shops ─────────────────────────────────────────

export async function getNearbyShops(query: NearbyShopsQueryInput) {
  const { lat, lng, radius, limit, page } = query;

  // 1. Get bounding box for SQL pre-filter
  const box = getBoundingBox(lat, lng, radius);

  // 2. Fetch active shops within bounding box
  const shopsInBox = await db
    .select({
      id: shops.id,
      barberId: shops.barberId,
      shopName: shops.shopName,
      shopPhoneNumber: shops.shopPhoneNumber,
      latitude: shops.latitude,
      longitude: shops.longitude,
      numberOfBarbers: shops.numberOfBarbers,
      workingHours: shops.workingHours,
      isActive: shops.isActive,
      createdAt: shops.createdAt,
    })
    .from(shops)
    .where(
      and(
        eq(shops.isActive, true),
        gte(shops.latitude, box.minLat),
        lte(shops.latitude, box.maxLat),
        gte(shops.longitude, box.minLng),
        lte(shops.longitude, box.maxLng),
      ),
    );

  // 3. Compute haversine distance and filter by actual radius
  const shopsWithDistance = shopsInBox
    .map((shop) => ({
      ...shop,
      distance: haversineDistance(lat, lng, shop.latitude, shop.longitude),
    }))
    .filter((shop) => shop.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  // 4. Paginate
  const total = shopsWithDistance.length;
  const offset = (page - 1) * limit;
  const paginatedShops = shopsWithDistance.slice(offset, offset + limit);

  // 5. Fetch services + review stats for each shop
  const shopIds = paginatedShops.map((s) => s.id);

  const enrichedShops = await Promise.all(
    paginatedShops.map(async (shop) => {
      const shopServices = await db
        .select({
          id: services.id,
          serviceName: services.serviceName,
          price: services.price,
          durationMinutes: services.durationMinutes,
        })
        .from(services)
        .where(eq(services.shopId, shop.id));

      const [reviewStats] = await db
        .select({
          averageRating: sql<string>`coalesce(round(avg(${reviews.rating}), 1)::text, '0')`,
          totalReviews: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(eq(reviews.shopId, shop.id));

      return {
        id: shop.id,
        shopName: shop.shopName,
        shopPhoneNumber: shop.shopPhoneNumber,
        latitude: shop.latitude,
        longitude: shop.longitude,
        numberOfBarbers: shop.numberOfBarbers,
        workingHours: shop.workingHours,
        distance: shop.distance,
        rating: {
          average: parseFloat(reviewStats.averageRating),
          total: reviewStats.totalReviews,
        },
        services: shopServices.map((s) => ({
          id: s.id,
          serviceName: s.serviceName,
          price: formatMoney(s.price),
          durationMinutes: s.durationMinutes,
        })),
      };
    }),
  );

  return {
    shops: enrichedShops,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Shop Detail ──────────────────────────────────────────

export async function getShopDetail(shopId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
    with: {
      services: true,
      barber: {
        columns: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  if (!shop) {
    throw new NotFoundError('Shop not found');
  }

  // Fetch review stats
  const [reviewStats] = await db
    .select({
      averageRating: sql<string>`coalesce(round(avg(${reviews.rating}), 1)::text, '0')`,
      totalReviews: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(eq(reviews.shopId, shopId));

  // Fetch recent reviews
  const recentReviews = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(eq(reviews.shopId, shopId))
    .orderBy(sql`${reviews.createdAt} desc`)
    .limit(5);

  return {
    id: shop.id,
    shopName: shop.shopName,
    shopPhoneNumber: shop.shopPhoneNumber,
    latitude: shop.latitude,
    longitude: shop.longitude,
    numberOfBarbers: shop.numberOfBarbers,
    workingHours: shop.workingHours,
    isActive: shop.isActive,
    barber: {
      id: shop.barber.id,
      fullName: shop.barber.fullName,
    },
    rating: {
      average: parseFloat(reviewStats.averageRating),
      total: reviewStats.totalReviews,
    },
    services: shop.services.map((s) => ({
      id: s.id,
      serviceName: s.serviceName,
      price: formatMoney(s.price),
      durationMinutes: s.durationMinutes,
    })),
    recentReviews: recentReviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}
