import { Router } from 'express';
import { validate, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  generateCouponsSchema,
  listCouponsQuerySchema,
  listUsersQuerySchema,
} from './admin.schema';
import {
  generateCoupons,
  listCoupons,
  listUsers,
  getStats,
} from './admin.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole(USER_ROLES.ADMIN));

// ─── Generate Coupons ─────────────────────────────────────
router.post(
  '/coupons/generate',
  validate(generateCouponsSchema),
  async (req, res) => {
    const data = await generateCoupons(req.body);
    sendSuccess(res, data, `${data.quantity} coupons generated`, 201);
  },
);

// ─── List Coupons ─────────────────────────────────────────
router.get(
  '/coupons',
  validateQuery(listCouponsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./admin.schema').ListCouponsQueryInput;
    const data = await listCoupons(query);
    sendSuccess(res, data, 'Coupons retrieved');
  },
);

// ─── List Users ───────────────────────────────────────────
router.get(
  '/users',
  validateQuery(listUsersQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./admin.schema').ListUsersQueryInput;
    const data = await listUsers(query);
    sendSuccess(res, data, 'Users retrieved');
  },
);

// ─── Dashboard Stats ──────────────────────────────────────
router.get(
  '/stats',
  async (_req, res) => {
    const data = await getStats();
    sendSuccess(res, data, 'Stats retrieved');
  },
);

export default router;
