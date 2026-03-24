import { Router } from 'express';
import { strictRateLimiter } from '../../middleware/rate-limit';
import { validate, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  redeemCouponSchema,
  walletTransactionsQuerySchema,
} from './wallet.schema';
import {
  getWalletBalance,
  getWalletTransactions,
  redeemCoupon,
} from './wallet.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// ─── Get Wallet Balance ───────────────────────────────────
router.get(
  '/balance',
  requireAuth,
  requireVerified,
  async (req, res) => {
    const data = await getWalletBalance(req.user!.id);
    sendSuccess(res, data, 'Wallet balance retrieved');
  },
);

// ─── Get Wallet Transactions ──────────────────────────────
router.get(
  '/transactions',
  requireAuth,
  requireVerified,
  validateQuery(walletTransactionsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./wallet.schema').WalletTransactionsQueryInput;
    const data = await getWalletTransactions(req.user!.id, query);
    sendSuccess(res, data, 'Wallet transactions retrieved');
  },
);

// ─── Redeem Coupon ────────────────────────────────────────
router.post(
  '/redeem-coupon',
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.CUSTOMER),
  strictRateLimiter,
  validate(redeemCouponSchema),
  async (req, res) => {
    const data = await redeemCoupon(req.user!.id, req.body);
    sendSuccess(res, data, 'Coupon redeemed successfully');
  },
);

export default router;
