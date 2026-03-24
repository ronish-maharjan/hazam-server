import { Router } from 'express';
import { validate, validateParams } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  createShopSchema,
  updateShopSchema,
  toggleShopStatusSchema,
  addServiceSchema,
  updateServiceSchema,
  serviceIdParamSchema,
} from './shop.schema';
import {
  createShop,
  getOwnShop,
  updateShop,
  toggleShopStatus,
} from './shop.service';
import {
  addService,
  updateService,
  deleteService,
} from './service.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// All shop management routes require: auth + verified + complete profile + barber role
const barberGuard = [
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.BARBER),
];

// ─── Create Shop ──────────────────────────────────────────
router.post(
  '/shop',
  ...barberGuard,
  validate(createShopSchema),
  async (req, res) => {
    const data = await createShop(req.user!.id, req.body);
    sendSuccess(res, data, 'Shop created successfully', 201);
  },
);

// ─── Get Own Shop ─────────────────────────────────────────
router.get(
  '/shop',
  ...barberGuard,
  async (req, res) => {
    const data = await getOwnShop(req.user!.id);
    sendSuccess(res, data, 'Shop retrieved');
  },
);

// ─── Update Shop ──────────────────────────────────────────
router.patch(
  '/shop',
  ...barberGuard,
  validate(updateShopSchema),
  async (req, res) => {
    const data = await updateShop(req.user!.id, req.body);
    sendSuccess(res, data, 'Shop updated');
  },
);

// ─── Toggle Shop Status ──────────────────────────────────
router.patch(
  '/shop/status',
  ...barberGuard,
  validate(toggleShopStatusSchema),
  async (req, res) => {
    const data = await toggleShopStatus(req.user!.id, req.body);
    sendSuccess(res, data, `Shop ${data.isActive ? 'activated' : 'deactivated'}`);
  },
);

// ─── Add Service ──────────────────────────────────────────
router.post(
  '/shop/services',
  ...barberGuard,
  validate(addServiceSchema),
  async (req, res) => {
    const data = await addService(req.user!.id, req.body);
    sendSuccess(res, data, 'Service added', 201);
  },
);

// ─── Update Service ──────────────────────────────────────
router.patch(
  '/shop/services/:serviceId',
  ...barberGuard,
  validateParams(serviceIdParamSchema),
  validate(updateServiceSchema),
  async (req, res) => {
    const data = await updateService(
      req.user!.id,
      req.params.serviceId,
      req.body,
    );
    sendSuccess(res, data, 'Service updated');
  },
);

// ─── Delete Service ──────────────────────────────────────
router.delete(
  '/shop/services/:serviceId',
  ...barberGuard,
  validateParams(serviceIdParamSchema),
  async (req, res) => {
    const data = await deleteService(req.user!.id, req.params.serviceId);
    sendSuccess(res, data, data.message);
  },
);

export default router;
