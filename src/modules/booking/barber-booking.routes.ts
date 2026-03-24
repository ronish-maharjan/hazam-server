import { Router } from 'express';
import { validateParams, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  bookingIdParamSchema,
  barberBookingsQuerySchema,
} from './booking.schema';
import {
  confirmBooking,
  completeBooking,
  cancelBookingByBarber,
  getBarberBookings,
} from './booking.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

const barberGuard = [
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.BARBER),
];

// ─── List Barber Bookings ────────────────────────────────
router.get(
  '/',
  ...barberGuard,
  validateQuery(barberBookingsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./booking.schema').BarberBookingsQueryInput;
    const data = await getBarberBookings(req.user!.id, query);
    sendSuccess(res, data, 'Bookings retrieved');
  },
);

// ─── Confirm Booking ─────────────────────────────────────
router.patch(
  '/:bookingId/confirm',
  ...barberGuard,
  validateParams(bookingIdParamSchema),
  async (req, res) => {
    const data = await confirmBooking(req.user!.id, req.params.bookingId);
    sendSuccess(res, data, 'Booking confirmed');
  },
);

// ─── Complete Booking ────────────────────────────────────
router.patch(
  '/:bookingId/complete',
  ...barberGuard,
  validateParams(bookingIdParamSchema),
  async (req, res) => {
    const data = await completeBooking(req.user!.id, req.params.bookingId);
    sendSuccess(res, data, 'Booking completed');
  },
);

// ─── Cancel Booking (Barber) ─────────────────────────────
router.patch(
  '/:bookingId/cancel',
  ...barberGuard,
  validateParams(bookingIdParamSchema),
  async (req, res) => {
    const data = await cancelBookingByBarber(req.user!.id, req.params.bookingId);
    sendSuccess(res, data, 'Booking cancelled');
  },
);

export default router;
