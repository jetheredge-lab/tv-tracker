import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRouter from './routes/index.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import schedulerService from './services/scheduler.js';
import prisma from './services/prisma.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
// Bind to loopback: the Cloudflare Tunnel connects over localhost, so the
// port never needs to be reachable from the LAN. This is also what makes
// the CF-Connecting-IP header trustworthy for rate limiting.
const HOST = process.env.HOST || '127.0.0.1';

// Trust only the loopback hop, so a client cannot forge forwarding headers.
app.set('trust proxy', 'loopback');

// Security and Logging Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Permit flexible mobile/web communication
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Welcome Route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'TV Tracker & Streaming Notification API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      showsSearch: '/api/shows/search?q=:query',
      showDetails: '/api/shows/:id',
      watchlist: '/api/watchlist/:userId',
      icsFeed: '/api/calendar/:userId/feed.ics',
      calendarEpisodes: '/api/calendar/:userId/episodes',
      userSync: '/api/users/sync',
    },
  });
});

// Rate limiting, mounted before the router so it also covers 404s under /api.
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Register API Routes
app.use('/api', apiRouter);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
});

// Start Server and Cron Scheduler
const server = app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 TV Tracker API Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log(`📅 ICS Feed: http://localhost:${PORT}/api/calendar/:userId/feed.ics`);
  console.log(`====================================================`);

  // Start background cron jobs
  if (process.env.NODE_ENV !== 'test') {
    schedulerService.start();
  }
});

// Graceful Shutdown
const handleGracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  schedulerService.stop();
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Database connection closed. Server terminated.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

export default app;
