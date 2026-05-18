import { Router } from 'express';
import { validate, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import { env } from '../../config/env';
import {
  initiatePaymentSchema,
  paymentHistoryQuerySchema,
} from './payment.schema';
import {
  initiatePayment,
  handleEsewaSuccess,
  handleEsewaFailure,
  getPaymentHistory,
} from './payment.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// ─── Initiate Payment ─────────────────────────────────────
router.post(
  '/initiate',
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.CUSTOMER),
  validate(initiatePaymentSchema),
  async (req, res) => {
    const data = await initiatePayment(req.user!.id, req.body);
    sendSuccess(res, data, 'Payment initiated successfully');
  },
);

// ─── eSewa Success Callback ──────────────────────────────
// Called by eSewa via browser redirect after successful payment.
// NO auth — eSewa doesn't have our tokens.
// After processing, redirects user to frontend wallet page.
router.get('/esewa/success', async (req, res) => {
  const encodedData = req.query.data as string;

  if (!encodedData) {
    return res.redirect(
      `${env.FRONTEND_URL}/wallet?status=failed&message=${encodeURIComponent('No payment data received from eSewa')}`,
    );
  }

  try {
    const result = await handleEsewaSuccess(encodedData);

    return res.redirect(
      `${env.FRONTEND_URL}/wallet?status=success&amount=${result.amount}&ref=${result.esewaTransactionCode}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Payment verification failed';

    return res.redirect(
      `${env.FRONTEND_URL}/wallet?status=failed&message=${encodeURIComponent(message)}`,
    );
  }
});

// ─── eSewa Failure Callback ──────────────────────────────
// Called by eSewa via browser redirect when user cancels or payment fails.
router.get('/esewa/failure', async (req, res) => {
  const encodedData = req.query.data as string;

  // Try to mark payment as failed in our DB
  if (encodedData) {
    try {
      await handleEsewaFailure(encodedData);
    } catch {
      // Silently ignore — we still redirect to frontend either way
    }
  }

  return res.redirect(
    `${env.FRONTEND_URL}/wallet?status=failed&message=${encodeURIComponent('Payment was cancelled or failed')}`,
  );
});

// ─── Payment History ──────────────────────────────────────
router.get(
  '/history',
  requireAuth,
  requireVerified,
  validateQuery(paymentHistoryQuerySchema),
  async (req, res) => {
    const query =
      req.query as unknown as import('./payment.schema').PaymentHistoryQueryInput;
    const data = await getPaymentHistory(req.user!.id, query);
    sendSuccess(res, data, 'Payment history retrieved');
  },
);

export default router;
