import { creditWallet, debitWallet } from '../wallet/wallet.service';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database';
import { pool } from '../../config/database';
import {
    bookings,
    shops,
    services,
    users,
} from '../../db/schema/index';
import {
    BOOKING_STATUSES,
} from '../../config/constants';
import {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    PaymentRequiredError,
} from '../../errors/index';
import { formatMoney, isGreaterThanOrEqual } from '../../utils/decimal';
import {
    sendEmail,
    bookingCreatedCustomerTemplate,
    bookingCreatedBarberTemplate,
    bookingConfirmedTemplate,
    bookingCancelledTemplate,
} from '../../utils/email';
import type { CreateBookingInput } from './booking.schema';
import type { DayHours, WorkingHours } from '../../db/schema/shops';

// ─── Helpers ──────────────────────────────────────────────

const DAYS_OF_WEEK: Record<number, keyof WorkingHours> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
};

/**
 * Adds minutes to a HH:MM time string.
 * Returns HH:MM string.
 */
function addMinutesToTime(time: string, minutes: number): string {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

/**
 * Checks if a time range [start, end) falls within working hours [open, close).
 */
function isWithinWorkingHours(
    appointmentTime: string,
    endTime: string,
    dayHours: DayHours,
): boolean {
    if (dayHours.isClosed) return false;
    return appointmentTime >= dayHours.open && endTime <= dayHours.close;
}

// ─── Format Booking Response ──────────────────────────────

interface BookingRow {
    id: string;
    customerId: string;
    shopId: string;
    serviceId: string;
    appointmentDate: string;
    appointmentTime: string;
    endTime: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

function formatBookingResponse(booking: BookingRow) {
    return {
        id: booking.id,
        customerId: booking.customerId,
        shopId: booking.shopId,
        serviceId: booking.serviceId,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
        endTime: booking.endTime,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
    };
}

// ─── Create Booking ───────────────────────────────────────

export async function createBooking(
    customerId: string,
    input: CreateBookingInput,
) {
    // 1. Fetch shop
    const shop = await db.query.shops.findFirst({
        where: eq(shops.id, input.shopId),
    });

    if (!shop) {
        throw new NotFoundError('Shop not found');
    }

    if (!shop.isActive) {
        throw new ForbiddenError('This shop is currently inactive and not accepting bookings');
    }

    // Prevent customer from booking their own shop (if they also have a barber account somehow)
    if (shop.barberId === customerId) {
        throw new ForbiddenError('You cannot book your own shop');
    }
    // 2. Fetch service and verify it belongs to the shop
    const service = await db.query.services.findFirst({
        where: and(
            eq(services.id, input.serviceId),
            eq(services.shopId, input.shopId),
        ),
    });

    if (!service) {
        throw new NotFoundError('Service not found in this shop');
    }
    // Validate appointment is not in the past (date + time combined check)
    const now = new Date();
    const appointmentDateObj = new Date(input.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (appointmentDateObj.getTime() === today.getTime()) {
        // Same day — check if appointment time has already passed
        const [appHours, appMins] = input.appointmentTime.split(':').map(Number);
        const appointmentMinutes = appHours * 60 + appMins;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        if (appointmentMinutes <= currentMinutes) {
            throw new ForbiddenError('Appointment time has already passed for today');
        }
    }
    // 3. Validate appointment day + time against working hours
    const appointmentDate = new Date(input.appointmentDate);
    const dayOfWeek = appointmentDate.getUTCDay();
    const dayName = DAYS_OF_WEEK[dayOfWeek];
    const workingHours = shop.workingHours as WorkingHours;
    const dayHours = workingHours[dayName];

    const endTime = addMinutesToTime(input.appointmentTime, service.durationMinutes);

    if (!isWithinWorkingHours(input.appointmentTime, endTime, dayHours)) {
        if (dayHours.isClosed) {
            throw new ForbiddenError(
                `Shop is closed on ${dayName}`,
            );
        }
        throw new ForbiddenError(
            `Appointment must be within working hours: ${dayHours.open} - ${dayHours.close}`,
        );
    }

    // 4. Check customer wallet has sufficient balance
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check wallet balance (no lock needed — just a read check at creation)
        const walletResult = await client.query(
            `SELECT balance FROM wallets WHERE user_id = $1`,
                [customerId],
        );

        if (walletResult.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new NotFoundError('Wallet not found');
        }

        const walletBalance = walletResult.rows[0].balance;

        if (!isGreaterThanOrEqual(walletBalance, service.price)) {
            await client.query('ROLLBACK');
            throw new PaymentRequiredError(
                `Insufficient wallet balance. Current: NPR ${formatMoney(walletBalance)}, Required: NPR ${formatMoney(service.price)}`,
            );
        }

        // 5. Double-booking prevention with capacity check
        // Lock overlapping booking rows to prevent concurrent inserts
        const overlapResult = await client.query(
            `SELECT id
            FROM bookings
            WHERE shop_id = $1
            AND appointment_date = $2
            AND status IN ('pending', 'confirmed')
            AND appointment_time < $3
            AND end_time > $4
            FOR UPDATE`,
                [input.shopId, input.appointmentDate, endTime, input.appointmentTime],
        );

        const overlappingCount = overlapResult.rows.length;

        if (overlappingCount >= shop.numberOfBarbers) {
            await client.query('ROLLBACK');
            throw new ConflictError(
                'This time slot is fully booked. Please choose a different time.',
            );
        }

        // 6. Create the booking
        const bookingResult = await client.query(
            `INSERT INTO bookings
            (customer_id, shop_id, service_id, appointment_date, appointment_time, end_time, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, customer_id, shop_id, service_id, appointment_date, appointment_time, end_time, status, created_at, updated_at`,
            [
                customerId,
                input.shopId,
                input.serviceId,
                input.appointmentDate,
                input.appointmentTime,
                endTime,
                BOOKING_STATUSES.PENDING,
            ],
        );

        await client.query('COMMIT');

        const booking = bookingResult.rows[0];

        // 7. Send email notifications (fire-and-forget, outside transaction)
        const customer = await db.query.users.findFirst({
            where: eq(users.id, customerId),
        });

        const barber = await db.query.users.findFirst({
            where: eq(users.id, shop.barberId),
        });

        if (customer) {
            const template = bookingCreatedCustomerTemplate(
                customer.fullName,
                shop.shopName,
                service.serviceName,
                input.appointmentDate,
                input.appointmentTime,
            );
            sendEmail({
                to: customer.email,
                subject: template.subject,
                html: template.html,
            }).catch(() => {});
        }

        if (barber) {
            const template = bookingCreatedBarberTemplate(
                barber.fullName,
                customer?.fullName || 'Customer',
                service.serviceName,
                input.appointmentDate,
                input.appointmentTime,
            );
            sendEmail({
                to: barber.email,
                subject: template.subject,
                html: template.html,
            }).catch(() => {});
        }

        return formatBookingResponse({
            id: booking.id,
            customerId: booking.customer_id,
            shopId: booking.shop_id,
            serviceId: booking.service_id,
            appointmentDate: booking.appointment_date,
            appointmentTime: booking.appointment_time,
            endTime: booking.end_time,
            status: booking.status,
            createdAt: booking.created_at,
            updatedAt: booking.updated_at,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ─── Helper: Get booking and verify barber ownership ─────

async function getBarberBooking(barberId: string, bookingId: string) {
    // Find barber's shop
    const shop = await db.query.shops.findFirst({
        where: eq(shops.barberId, barberId),
    });

    if (!shop) {
        throw new NotFoundError('You have not created a shop yet');
    }

    // Find booking and verify it belongs to this shop
    const booking = await db.query.bookings.findFirst({
        where: and(
            eq(bookings.id, bookingId),
            eq(bookings.shopId, shop.id),
        ),
    });

    if (!booking) {
        throw new NotFoundError('Booking not found in your shop');
    }

    return { shop, booking };
}

// ─── Confirm Booking ──────────────────────────────────────

export async function confirmBooking(barberId: string, bookingId: string) {
    const { shop, booking: initialBooking } = await getBarberBooking(barberId, bookingId);

    // Preliminary status check (fast fail before acquiring locks)
    if (initialBooking.status !== BOOKING_STATUSES.PENDING) {
        throw new ConflictError(
            `Cannot confirm a booking that is "${initialBooking.status}". Only pending bookings can be confirmed.`,
        );
    }

    // Fetch service for price
    const service = await db.query.services.findFirst({
        where: eq(services.id, initialBooking.serviceId),
    });

    if (!service) {
        throw new NotFoundError('Service associated with this booking no longer exists');
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Re-check status under lock (prevents double-confirm race condition)
        const lockResult = await client.query(
            `SELECT status FROM bookings WHERE id = $1 FOR UPDATE`,
                    [bookingId],
        );

    if (lockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Booking not found');
    }

    if (lockResult.rows[0].status !== BOOKING_STATUSES.PENDING) {
        await client.query('ROLLBACK');
        throw new ConflictError(
            `Cannot confirm a booking that is "${lockResult.rows[0].status}". Only pending bookings can be confirmed.`,
        );
    }

    // 1. Debit customer wallet (re-checks balance under lock)
    await debitWallet(
        client,
        initialBooking.customerId,
        service.price,
        `Booking payment for ${service.serviceName} at ${shop.shopName}`,
        initialBooking.id,
    );

    // 2. Credit barber wallet
    await creditWallet(
        client,
        shop.barberId,
        service.price,
        `Payment received for ${service.serviceName}`,
        initialBooking.id,
    );

    // 3. Update booking status
    await client.query(
        `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2`,
            [BOOKING_STATUSES.CONFIRMED, initialBooking.id],
    );

    await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    // Send confirmation email to customer (fire-and-forget)
    const customer = await db.query.users.findFirst({
        where: eq(users.id, initialBooking.customerId),
    });

    if (customer) {
        const template = bookingConfirmedTemplate(
            customer.fullName,
            shop.shopName,
            service.serviceName,
            initialBooking.appointmentDate,
            initialBooking.appointmentTime,
        );
        sendEmail({
            to: customer.email,
            subject: template.subject,
            html: template.html,
        }).catch(() => {});
    }

    // Return updated booking
    const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, initialBooking.id));

    return formatBookingResponse({
        id: updated.id,
        customerId: updated.customerId,
        shopId: updated.shopId,
        serviceId: updated.serviceId,
        appointmentDate: updated.appointmentDate,
        appointmentTime: updated.appointmentTime,
        endTime: updated.endTime,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    });
}

// ─── Complete Booking ─────────────────────────────────────

export async function completeBooking(barberId: string, bookingId: string) {
    const { booking: initialBooking } = await getBarberBooking(barberId, bookingId);

    if (initialBooking.status !== BOOKING_STATUSES.CONFIRMED) {
        throw new ConflictError(
            `Cannot complete a booking that is "${initialBooking.status}". Only confirmed bookings can be marked complete.`,
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Re-check status under lock
        const lockResult = await client.query(
            `SELECT status FROM bookings WHERE id = $1 FOR UPDATE`,
                    [bookingId],
        );

    if (lockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Booking not found');
    }

    if (lockResult.rows[0].status !== BOOKING_STATUSES.CONFIRMED) {
        await client.query('ROLLBACK');
        throw new ConflictError(
            `Cannot complete a booking that is "${lockResult.rows[0].status}". Only confirmed bookings can be marked complete.`,
        );
    }

    await client.query(
        `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2`,
            [BOOKING_STATUSES.COMPLETED, initialBooking.id],
    );

    await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, initialBooking.id));

    return formatBookingResponse({
        id: updated.id,
        customerId: updated.customerId,
        shopId: updated.shopId,
        serviceId: updated.serviceId,
        appointmentDate: updated.appointmentDate,
        appointmentTime: updated.appointmentTime,
        endTime: updated.endTime,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    });
}

// ─── Cancel Booking (Barber) ──────────────────────────────

export async function cancelBookingByBarber(
    barberId: string,
    bookingId: string,
) {
    const { shop, booking: initialBooking } = await getBarberBooking(barberId, bookingId);

    if (
        initialBooking.status !== BOOKING_STATUSES.PENDING &&
        initialBooking.status !== BOOKING_STATUSES.CONFIRMED
    ) {
        throw new ConflictError(
            `Cannot cancel a booking that is "${initialBooking.status}". Only pending or confirmed bookings can be cancelled.`,
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Re-check status under lock
        const lockResult = await client.query(
            `SELECT status FROM bookings WHERE id = $1 FOR UPDATE`,
                    [bookingId],
        );

    if (lockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Booking not found');
    }

    const currentStatus = lockResult.rows[0].status;

    if (
        currentStatus !== BOOKING_STATUSES.PENDING &&
        currentStatus !== BOOKING_STATUSES.CONFIRMED
    ) {
        await client.query('ROLLBACK');
        throw new ConflictError(
            `Cannot cancel a booking that is "${currentStatus}". Only pending or confirmed bookings can be cancelled.`,
        );
    }

    const wasConfirmed = currentStatus === BOOKING_STATUSES.CONFIRMED;

    if (wasConfirmed) {
        const service = await db.query.services.findFirst({
            where: eq(services.id, initialBooking.serviceId),
        });

        if (!service) {
            await client.query('ROLLBACK');
            throw new NotFoundError('Service associated with this booking no longer exists');
        }

        // Debit barber wallet (return money)
        await debitWallet(
            client,
            shop.barberId,
            service.price,
            `Refund for cancelled booking - ${service.serviceName}`,
            initialBooking.id,
        );

        // Credit customer wallet (refund)
        await creditWallet(
            client,
            initialBooking.customerId,
            service.price,
            `Refund for cancelled booking at ${shop.shopName} - ${service.serviceName}`,
            initialBooking.id,
        );
    }

    // Update booking status
    await client.query(
        `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2`,
            [BOOKING_STATUSES.CANCELLED, initialBooking.id],
    );

    await client.query('COMMIT');

    // Send cancellation email (fire-and-forget)
    const customer = await db.query.users.findFirst({
        where: eq(users.id, initialBooking.customerId),
    });

    const service = await db.query.services.findFirst({
        where: eq(services.id, initialBooking.serviceId),
    });

    if (customer && service) {
        const template = bookingCancelledTemplate(
            customer.fullName,
            shop.shopName,
            service.serviceName,
            initialBooking.appointmentDate,
            initialBooking.appointmentTime,
            wasConfirmed,
        );
        sendEmail({
            to: customer.email,
            subject: template.subject,
            html: template.html,
        }).catch(() => {});
    }
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    // Return updated booking
    const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, initialBooking.id));

    return formatBookingResponse({
        id: updated.id,
        customerId: updated.customerId,
        shopId: updated.shopId,
        serviceId: updated.serviceId,
        appointmentDate: updated.appointmentDate,
        appointmentTime: updated.appointmentTime,
        endTime: updated.endTime,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    });
}

// ─── List Barber Bookings ─────────────────────────────────

export async function getBarberBookings(
    barberId: string,
    query: import('./booking.schema').BarberBookingsQueryInput,
) {
    // Find barber's shop
    const shop = await db.query.shops.findFirst({
        where: eq(shops.barberId, barberId),
    });

    if (!shop) {
        throw new NotFoundError('You have not created a shop yet');
    }

    // Build conditions
    const conditions = [eq(bookings.shopId, shop.id)];

    if (query.status) {
        conditions.push(eq(bookings.status, query.status));
    }

    if (query.date) {
        conditions.push(eq(bookings.appointmentDate, query.date));
    }

    // Count total
    const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(...conditions));

    const total = countResult.count;

    // Fetch paginated bookings with customer + service info
    const offset = (query.page - 1) * query.limit;

    const bookingRows = await db
    .select({
        id: bookings.id,
        customerId: bookings.customerId,
        shopId: bookings.shopId,
        serviceId: bookings.serviceId,
        appointmentDate: bookings.appointmentDate,
        appointmentTime: bookings.appointmentTime,
        endTime: bookings.endTime,
        status: bookings.status,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        customerName: users.fullName,
        customerEmail: users.email,
        customerPhone: users.phoneNumber,
        serviceName: services.serviceName,
        servicePrice: services.price,
        serviceDuration: services.durationMinutes,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.customerId, users.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt))
    .limit(query.limit)
    .offset(offset);

    return {
        bookings: bookingRows.map((b) => ({
            id: b.id,
            appointmentDate: b.appointmentDate,
            appointmentTime: b.appointmentTime,
            endTime: b.endTime,
            status: b.status,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
            customer: {
                id: b.customerId,
                fullName: b.customerName,
                email: b.customerEmail,
                phoneNumber: b.customerPhone,
            },
            service: {
                id: b.serviceId,
                serviceName: b.serviceName,
                price: formatMoney(b.servicePrice),
                durationMinutes: b.serviceDuration,
            },
        })),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

// ─── List Customer Bookings ──────────────────────────────

export async function getCustomerBookings(
    customerId: string,
    query: import('./booking.schema').CustomerBookingsQueryInput,
) {
    // Build conditions
    const conditions = [eq(bookings.customerId, customerId)];

    if (query.status) {
        conditions.push(eq(bookings.status, query.status));
    }

    // Count total
    const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(...conditions));

    const total = countResult.count;

    // Fetch paginated bookings with shop + service info
    const offset = (query.page - 1) * query.limit;

    const bookingRows = await db
    .select({
        id: bookings.id,
        customerId: bookings.customerId,
        shopId: bookings.shopId,
        serviceId: bookings.serviceId,
        appointmentDate: bookings.appointmentDate,
        appointmentTime: bookings.appointmentTime,
        endTime: bookings.endTime,
        status: bookings.status,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        shopName: shops.shopName,
        shopPhone: shops.shopPhoneNumber,
        shopLat: shops.latitude,
        shopLng: shops.longitude,
        serviceName: services.serviceName,
        servicePrice: services.price,
        serviceDuration: services.durationMinutes,
    })
    .from(bookings)
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt))
    .limit(query.limit)
    .offset(offset);

    return {
        bookings: bookingRows.map((b) => ({
            id: b.id,
            appointmentDate: b.appointmentDate,
            appointmentTime: b.appointmentTime,
            endTime: b.endTime,
            status: b.status,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
            shop: {
                id: b.shopId,
                shopName: b.shopName,
                shopPhoneNumber: b.shopPhone,
                latitude: b.shopLat,
                longitude: b.shopLng,
            },
            service: {
                id: b.serviceId,
                serviceName: b.serviceName,
                price: formatMoney(b.servicePrice),
                durationMinutes: b.serviceDuration,
            },
        })),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

// ─── Get Customer Booking Detail ─────────────────────────

export async function getCustomerBookingDetail(
    customerId: string,
    bookingId: string,
) {
    const bookingRows = await db
    .select({
        id: bookings.id,
        customerId: bookings.customerId,
        shopId: bookings.shopId,
        serviceId: bookings.serviceId,
        appointmentDate: bookings.appointmentDate,
        appointmentTime: bookings.appointmentTime,
        endTime: bookings.endTime,
        status: bookings.status,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        shopName: shops.shopName,
        shopPhone: shops.shopPhoneNumber,
        shopLat: shops.latitude,
        shopLng: shops.longitude,
        barberName: users.fullName,
        serviceName: services.serviceName,
        servicePrice: services.price,
        serviceDuration: services.durationMinutes,
    })
    .from(bookings)
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(users, eq(shops.barberId, users.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
        and(
            eq(bookings.id, bookingId),
            eq(bookings.customerId, customerId),
        ),
    )
    .limit(1);

    if (bookingRows.length === 0) {
        throw new NotFoundError('Booking not found');
    }

    const b = bookingRows[0];

    return {
        id: b.id,
        appointmentDate: b.appointmentDate,
        appointmentTime: b.appointmentTime,
        endTime: b.endTime,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        shop: {
            id: b.shopId,
            shopName: b.shopName,
            shopPhoneNumber: b.shopPhone,
            latitude: b.shopLat,
            longitude: b.shopLng,
        },
        barber: {
            fullName: b.barberName,
        },
        service: {
            id: b.serviceId,
            serviceName: b.serviceName,
            price: formatMoney(b.servicePrice),
            durationMinutes: b.serviceDuration,
        },
    };
}

// ─── Cancel Booking (Customer) ───────────────────────────

export async function cancelBookingByCustomer(
    customerId: string,
    bookingId: string,
) {
    // Find booking and verify ownership
    const booking = await db.query.bookings.findFirst({
        where: and(
            eq(bookings.id, bookingId),
            eq(bookings.customerId, customerId),
        ),
    });

    if (!booking) {
        throw new NotFoundError('Booking not found');
    }

    // Customer can only cancel pending bookings
    if (booking.status !== BOOKING_STATUSES.PENDING) {
        throw new ConflictError(
            `Cannot cancel a booking that is "${booking.status}". You can only cancel pending bookings. Contact the barber for confirmed bookings.`,
        );
    }

    // No money was moved for pending bookings — just update status
    const [updated] = await db
.update(bookings)
.set({ status: BOOKING_STATUSES.CANCELLED })
.where(eq(bookings.id, booking.id))
.returning();

return formatBookingResponse({
    id: updated.id,
    customerId: updated.customerId,
    shopId: updated.shopId,
    serviceId: updated.serviceId,
    appointmentDate: updated.appointmentDate,
    appointmentTime: updated.appointmentTime,
    endTime: updated.endTime,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
});
}
