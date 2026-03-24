import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { sendSuccess } from './utils/response';
import { NotFoundError } from './errors';
import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
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

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  sendSuccess(
    res,
    { status: 'healthy', timestamp: new Date().toISOString() },
    'Hazam API is running',
  );
});

// ─── Routes will be mounted here in later steps ──────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// ─── 404 catch-all ────────────────────────────────────────
app.use((_req, _res, next) => {
  next(new NotFoundError('Route not found'));
});

// ─── Central error handler (must be last) ─────────────────
app.use(errorHandler);

export default app;
