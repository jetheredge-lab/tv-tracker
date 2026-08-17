import { Router } from 'express';
import authRoutes from './auth.routes.js';
import showsRoutes from './shows.routes.js';
import watchlistRoutes from './watchlist.routes.js';
import calendarRoutes from './calendar.routes.js';
import userRoutes from './user.routes.js';
import recommendationsRoutes from './recommendations.routes.js';

const router = Router();

// Health Check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'TV Tracker API',
    version: '0.3.0',
  });
});

// Feature Routers
router.use('/auth', authRoutes);
router.use('/shows', showsRoutes);
router.use('/watchlist', watchlistRoutes);
router.use('/recommendations', recommendationsRoutes);
router.use('/calendar', calendarRoutes);
router.use('/users', userRoutes);

export default router;
