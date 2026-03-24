import { Router } from 'express';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { requireVerified } from '../../middleware/require-verified';
import { requireCompleteProfile } from '../../middleware/require-complete-profile';
import { requireRole } from '../../middleware/require-role';
import { USER_ROLES } from '../../config/constants';
import {
  createReviewSchema,
  updateReviewSchema,
  reviewIdParamSchema,
  shopReviewsQuerySchema,
  shopIdParamSchema,
} from './review.schema';
import {
  createReview,
  updateReview,
  deleteReview,
  getShopReviews,
  getCustomerReviews,
} from './review.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

const customerGuard = [
  requireAuth,
  requireVerified,
  requireCompleteProfile,
  requireRole(USER_ROLES.CUSTOMER),
];

// ─── Create Review ────────────────────────────────────────
router.post(
  '/',
  ...customerGuard,
  validate(createReviewSchema),
  async (req, res) => {
    const data = await createReview(req.user!.id, req.body);
    sendSuccess(res, data, 'Review submitted successfully', 201);
  },
);

// ─── Get My Reviews ───────────────────────────────────────
router.get(
  '/my',
  ...customerGuard,
  validateQuery(shopReviewsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./review.schema').ShopReviewsQueryInput;
    const data = await getCustomerReviews(req.user!.id, query);
    sendSuccess(res, data, 'Your reviews retrieved');
  },
);

// ─── Update Review ────────────────────────────────────────
router.patch(
  '/:reviewId',
  ...customerGuard,
  validateParams(reviewIdParamSchema),
  validate(updateReviewSchema),
  async (req, res) => {
    const data = await updateReview(
      req.user!.id,
      req.params.reviewId,
      req.body,
    );
    sendSuccess(res, data, 'Review updated');
  },
);

// ─── Delete Review ────────────────────────────────────────
router.delete(
  '/:reviewId',
  ...customerGuard,
  validateParams(reviewIdParamSchema),
  async (req, res) => {
    const data = await deleteReview(req.user!.id, req.params.reviewId);
    sendSuccess(res, data, data.message);
  },
);

// ─── Get Shop Reviews (Public) ───────────────────────────
router.get(
  '/shop/:shopId',
  validateParams(shopIdParamSchema),
  validateQuery(shopReviewsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./review.schema').ShopReviewsQueryInput;
    const data = await getShopReviews(req.params.shopId, query);
    sendSuccess(res, data, 'Shop reviews retrieved');
  },
);

export default router;
