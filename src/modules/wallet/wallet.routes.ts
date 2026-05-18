import { Router } from 'express';
import { validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { walletTransactionsQuerySchema } from './wallet.schema';
import {
  getWalletBalance,
  getWalletTransactions,
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
    const query =
      req.query as unknown as import('./wallet.schema').WalletTransactionsQueryInput;
    const data = await getWalletTransactions(req.user!.id, query);
    sendSuccess(res, data, 'Wallet transactions retrieved');
  },
);

export default router;
