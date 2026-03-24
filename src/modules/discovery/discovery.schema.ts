import { z } from 'zod';
import { DEFAULT_PAGE_LIMIT } from '../../config/constants';

// ─── Nearby Shops Query ──────────────────────────────────

export const nearbyShopsQuerySchema = z.object({
  lat: z.coerce
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lng: z.coerce
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radius: z.coerce
    .number()
    .min(0.1, 'Radius must be at least 0.1 km')
    .max(50, 'Radius must be at most 50 km')
    .default(5),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(DEFAULT_PAGE_LIMIT),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),
});

export type NearbyShopsQueryInput = z.infer<typeof nearbyShopsQuerySchema>;

// ─── Shop Detail Param ───────────────────────────────────

export const shopIdParamSchema = z.object({
  shopId: z.string().uuid('Invalid shop ID'),
});

export type ShopIdParam = z.infer<typeof shopIdParamSchema>;
