import { Router } from 'express';
import { validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import { listUsersQuerySchema } from './admin.schema';
import { listUsers, getStats } from './admin.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole(USER_ROLES.ADMIN));

// ─── List Users ───────────────────────────────────────────
router.get(
  '/users',
  validateQuery(listUsersQuerySchema),
  async (req, res) => {
    const query =
      req.query as unknown as import('./admin.schema').ListUsersQueryInput;
    const data = await listUsers(query);
    sendSuccess(res, data, 'Users retrieved');
  },
);

// ─── Dashboard Stats ──────────────────────────────────────
router.get('/stats', async (_req, res) => {
  const data = await getStats();
  sendSuccess(res, data, 'Stats retrieved');
});

export default router;
