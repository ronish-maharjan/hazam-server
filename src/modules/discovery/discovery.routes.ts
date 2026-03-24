import { Router } from 'express';
import { validateQuery, validateParams } from '../../middleware/validate';
import {
  nearbyShopsQuerySchema,
  shopIdParamSchema,
} from './discovery.schema';
import {
  getNearbyShops,
  getShopDetail,
} from './discovery.service';
import { sendSuccess } from '../../utils/response';

const router = Router();

// ─── Nearby Shops (public) ───────────────────────────────
router.get(
  '/nearby',
  validateQuery(nearbyShopsQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as import('./discovery.schema').NearbyShopsQueryInput;
    const data = await getNearbyShops(query);
    sendSuccess(res, data, 'Nearby shops retrieved');
  },
);

// ─── Shop Detail (public) ───────────────────────────────
router.get(
  '/:shopId',
  validateParams(shopIdParamSchema),
  async (req, res) => {
    const data = await getShopDetail(req.params.shopId);
    sendSuccess(res, data, 'Shop details retrieved');
  },
);

export default router;
