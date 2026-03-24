import { z } from 'zod';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Create Booking (Customer) ────────────────────────────

export const createBookingSchema = z.object({
  shopId: z.string().uuid('Invalid shop ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  appointmentDate: z
    .string()
    .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
    .refine(
      (date) => {
        const appointment = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return appointment >= today;
      },
      { message: 'Appointment date cannot be in the past' },
    ),
  appointmentTime: z
    .string()
    .regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format'),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// ─── Booking ID Param ─────────────────────────────────────

export const bookingIdParamSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
});

export type BookingIdParam = z.infer<typeof bookingIdParamSchema>;

// ─── Customer Bookings Query ──────────────────────────────

export const customerBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['pending', 'confirmed', 'completed', 'cancelled'])
    .optional(),
});

export type CustomerBookingsQueryInput = z.infer<typeof customerBookingsQuerySchema>;

// ─── Barber Bookings Query ────────────────────────────────

export const barberBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['pending', 'confirmed', 'completed', 'cancelled'])
    .optional(),
  date: z
    .string()
    .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
    .optional(),
});

export type BarberBookingsQueryInput = z.infer<typeof barberBookingsQuerySchema>;
