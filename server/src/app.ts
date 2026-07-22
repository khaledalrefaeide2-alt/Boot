import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { errorHandler, notFound } from './middleware/error';
import { alertsRouter } from './routes/alerts.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { authRouter } from './routes/auth.routes';
import { collectionsRouter } from './routes/collections.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { databaseRouter } from './routes/database.routes';
import { historyRouter } from './routes/history.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { reportsRouter } from './routes/reports.routes';
import { globalSearchRouter } from './routes/search.routes';
import { settingsRouter } from './routes/settings.routes';
import { usersRouter } from './routes/users.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  if (!config.isProd) app.use(morgan('dev'));

  // Global rate limiting.
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Stricter limiter for auth endpoints.
  const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/collections', collectionsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/database', databaseRouter);
  app.use('/api/search', globalSearchRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
