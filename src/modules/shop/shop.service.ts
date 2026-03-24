import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { shops, services } from '../../db/schema/index';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../errors/index';
import { formatMoney } from '../../utils/decimal';
import type {
  CreateShopInput,
  UpdateShopInput,
  ToggleShopStatusInput,
} from './shop.schema';

// ─── Create Shop ──────────────────────────────────────────

export async function createShop(barberId: string, input: CreateShopInput) {
  // Check if barber already has a shop
  const existing = await db.query.shops.findFirst({
    where: eq(shops.barberId, barberId),
  });

  if (existing) {
    throw new ConflictError('You already have a shop. Each barber can only create one shop.');
  }

  const [shop] = await db
    .insert(shops)
    .values({
      barberId,
      shopName: input.shopName,
      shopPhoneNumber: input.shopPhoneNumber,
      latitude: input.latitude,
      longitude: input.longitude,
      numberOfBarbers: input.numberOfBarbers,
      workingHours: input.workingHours,
    })
    .returning({
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
      updatedAt: shops.updatedAt,
    });

  return { ...shop, services: [] };
}

// ─── Get Own Shop ─────────────────────────────────────────

export async function getOwnShop(barberId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.barberId, barberId),
    with: {
      services: true,
    },
  });

  if (!shop) {
    throw new NotFoundError('You have not created a shop yet');
  }

  return formatShopResponse(shop);
}

// ─── Update Shop ──────────────────────────────────────────

export async function updateShop(barberId: string, input: UpdateShopInput) {
  // Verify ownership
  const shop = await db.query.shops.findFirst({
    where: eq(shops.barberId, barberId),
  });

  if (!shop) {
    throw new NotFoundError('You have not created a shop yet');
  }

  // Build update data — only include provided fields
  const updateData: Record<string, unknown> = {};

  if (input.shopName !== undefined) updateData.shopName = input.shopName;
  if (input.shopPhoneNumber !== undefined) updateData.shopPhoneNumber = input.shopPhoneNumber;
  if (input.latitude !== undefined) updateData.latitude = input.latitude;
  if (input.longitude !== undefined) updateData.longitude = input.longitude;
  if (input.numberOfBarbers !== undefined) updateData.numberOfBarbers = input.numberOfBarbers;
  if (input.workingHours !== undefined) updateData.workingHours = input.workingHours;

  const [updated] = await db
    .update(shops)
    .set(updateData)
    .where(eq(shops.id, shop.id))
    .returning({
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
      updatedAt: shops.updatedAt,
    });

  // Fetch services separately
  const shopServices = await db.query.services.findMany({
    where: eq(services.shopId, shop.id),
  });

  return formatShopResponse({ ...updated, services: shopServices });
}

// ─── Toggle Shop Status ──────────────────────────────────

export async function toggleShopStatus(
  barberId: string,
  input: ToggleShopStatusInput,
) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.barberId, barberId),
  });

  if (!shop) {
    throw new NotFoundError('You have not created a shop yet');
  }

  const [updated] = await db
    .update(shops)
    .set({ isActive: input.isActive })
    .where(eq(shops.id, shop.id))
    .returning({
      id: shops.id,
      shopName: shops.shopName,
      isActive: shops.isActive,
      updatedAt: shops.updatedAt,
    });

  return updated;
}

// ─── Format Shop Response ─────────────────────────────────

interface ShopWithServices {
  id: string;
  barberId: string;
  shopName: string;
  shopPhoneNumber: string;
  latitude: number;
  longitude: number;
  numberOfBarbers: number;
  workingHours: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  services: Array<{
    id: string;
    shopId: string;
    serviceName: string;
    price: string;
    durationMinutes: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

function formatShopResponse(shop: ShopWithServices) {
  return {
    id: shop.id,
    barberId: shop.barberId,
    shopName: shop.shopName,
    shopPhoneNumber: shop.shopPhoneNumber,
    latitude: shop.latitude,
    longitude: shop.longitude,
    numberOfBarbers: shop.numberOfBarbers,
    workingHours: shop.workingHours,
    isActive: shop.isActive,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
    services: shop.services.map((s) => ({
      id: s.id,
      serviceName: s.serviceName,
      price: formatMoney(s.price),
      durationMinutes: s.durationMinutes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}
