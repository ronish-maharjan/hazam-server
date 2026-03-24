import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { sendSuccess } from './utils/response';
import { NotFoundError } from './errors/index';
import { apiRateLimiter } from './middleware/rate-limit';

// ─── Route imports ────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import adminRoutes from './modules/admin/admin.routes';
import shopRoutes from './modules/shop/shop.routes';
import barberBookingRoutes from './modules/booking/barber-booking.routes';
import bookingRoutes from './modules/booking/booking.routes';
import discoveryRoutes from './modules/discovery/discovery.routes';
import reviewRoutes from './modules/review/review.routes';

const app = express();

// ─── Global middleware ────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Global rate limiter ──────────────────────────────────
app.use('/api', apiRateLimiter);

// ─── Health check ─────────────────────────────────────────
// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  sendSuccess(
    res,
    { status: 'healthy', timestamp: new Date().toISOString() },
    'Hazam API is running',
  );
});

// ─── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/barber', shopRoutes);
app.use('/api/barber/bookings', barberBookingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/shops', discoveryRoutes);
app.use('/api/reviews', reviewRoutes);

// ─── 404 catch-all ────────────────────────────────────────
app.use((_req, _res, next) => {
  next(new NotFoundError('Route not found'));
});

// ─── Central error handler (must be last) ─────────────────
app.use(errorHandler);

export default app;
