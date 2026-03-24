import { Router } from 'express';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  createBookingSchema,
  bookingIdParamSchema,
  customerBookingsQuerySchema,
  barberBookingsQuerySchema,
} from './booking.schema';
import {
  createBooking,
  confirmBooking,
  completeBooking,
  cancelBookingByBarber,
  getBarberBookings,
  getCustomerBookings,
  getCustomerBookingDetail,
  cancelBookingByCustomer,
} from './booking.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// ─── Middleware groups ────────────────────────────────────

const customerGuard = [
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.CUSTOMER),
];

const barberGuard = [
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.BARBER),
];

// ═══════════════════════════════════════════════════════════
// CUSTOMER BOOKING ENDPOINTS
// ═══════════════════════════════════════════════════════════

// ─── Create Booking ───────────────────────────────────────
router.post(
  '/',
  ...customerGuard,
  validate(createBookingSchema),
  async (req, res) => {
    const data = await createBooking(req.user!.id, req.body);
    sendSuccess(res, data, 'Booking created successfully', 201);
  },
);

// ─── List Customer Bookings ──────────────────────────────
router.get(
  '/',
  ...customerGuard,
  validateQuery(customerBookingsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./booking.schema').CustomerBookingsQueryInput;
    const data = await getCustomerBookings(req.user!.id, query);
    sendSuccess(res, data, 'Bookings retrieved');
  },
);

// ─── Get Customer Booking Detail ─────────────────────────
router.get(
  '/:bookingId',
  ...customerGuard,
  validateParams(bookingIdParamSchema),
  async (req, res) => {
    const data = await getCustomerBookingDetail(
      req.user!.id,
      req.params.bookingId,
    );
    sendSuccess(res, data, 'Booking details retrieved');
  },
);

// ─── Cancel Booking (Customer) ───────────────────────────
router.delete(
  '/:bookingId',
  ...customerGuard,
  validateParams(bookingIdParamSchema),
  async (req, res) => {
    const data = await cancelBookingByCustomer(
      req.user!.id,
      req.params.bookingId,
    );
    sendSuccess(res, data, 'Booking cancelled');
  },
);

export default router;
