import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { updateProfileSchema, changePasswordSchema } from './profile.schema';
import { getProfile, updateProfile, changePassword } from './profile.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// ─── Get Own Profile ──────────────────────────────────────
router.get(
  '/',
  requireAuth,
  async (req, res) => {
    const data = await getProfile(req.user!.id);
    sendSuccess(res, data, 'Profile retrieved');
  },
);

// ─── Update Profile ───────────────────────────────────────
router.patch(
  '/',
  requireAuth,
  validate(updateProfileSchema),
  async (req, res) => {
    const data = await updateProfile(req.user!.id, req.body);
    sendSuccess(res, data, 'Profile updated');
  },
);

// ─── Change Password ─────────────────────────────────────
router.patch(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  async (req, res) => {
    const data = await changePassword(req.user!.id, req.body);
    sendSuccess(res, data, data.message);
  },
);

export default router;
