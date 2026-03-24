import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database';
import { shops, services } from '../../db/schema/index';
import {
  NotFoundError,
  ForbiddenError,
} from '../../errors/index';
import { formatMoney } from '../../utils/decimal';
import type {
  AddServiceInput,
  UpdateServiceInput,
} from './shop.schema';

// ─── Helper: Get barber's shop or throw ──────────────────

async function getBarberShop(barberId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.barberId, barberId),
  });

  if (!shop) {
    throw new NotFoundError('You have not created a shop yet');
  }

  return shop;
}

// ─── Helper: Get service and verify ownership ────────────

async function getOwnedService(barberId: string, serviceId: string) {
  const shop = await getBarberShop(barberId);

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.shopId, shop.id),
    ),
  });

  if (!service) {
    throw new NotFoundError('Service not found in your shop');
  }

  return { shop, service };
}

// ─── Format Service Response ─────────────────────────────

function formatServiceResponse(service: {
  id: string;
  shopId: string;
  serviceName: string;
  price: string;
  durationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: service.id,
    shopId: service.shopId,
    serviceName: service.serviceName,
    price: formatMoney(service.price),
    durationMinutes: service.durationMinutes,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

// ─── Add Service ──────────────────────────────────────────

export async function addService(barberId: string, input: AddServiceInput) {
  const shop = await getBarberShop(barberId);

  const [service] = await db
    .insert(services)
    .values({
      shopId: shop.id,
      serviceName: input.serviceName,
      price: input.price.toFixed(2),
      durationMinutes: input.durationMinutes,
    })
    .returning({
      id: services.id,
      shopId: services.shopId,
      serviceName: services.serviceName,
      price: services.price,
      durationMinutes: services.durationMinutes,
      createdAt: services.createdAt,
      updatedAt: services.updatedAt,
    });

  return formatServiceResponse(service);
}

// ─── Update Service ───────────────────────────────────────

export async function updateService(
  barberId: string,
  serviceId: string,
  input: UpdateServiceInput,
) {
  await getOwnedService(barberId, serviceId);

  const updateData: Record<string, unknown> = {};

  if (input.serviceName !== undefined) updateData.serviceName = input.serviceName;
  if (input.price !== undefined) updateData.price = input.price.toFixed(2);
  if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes;

  const [updated] = await db
    .update(services)
    .set(updateData)
    .where(eq(services.id, serviceId))
    .returning({
      id: services.id,
      shopId: services.shopId,
      serviceName: services.serviceName,
      price: services.price,
      durationMinutes: services.durationMinutes,
      createdAt: services.createdAt,
      updatedAt: services.updatedAt,
    });

  return formatServiceResponse(updated);
}

// ─── Delete Service ───────────────────────────────────────

export async function deleteService(barberId: string, serviceId: string) {
  await getOwnedService(barberId, serviceId);

  await db
    .delete(services)
    .where(eq(services.id, serviceId));

  return { message: 'Service deleted successfully' };
}

// ─── List Shop Services ──────────────────────────────────

export async function listShopServices(barberId: string) {
  const shop = await getBarberShop(barberId);

  const shopServices = await db.query.services.findMany({
    where: eq(services.shopId, shop.id),
  });

  return shopServices.map(formatServiceResponse);
}
