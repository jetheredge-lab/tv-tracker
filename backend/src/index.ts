import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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

// Exported Expo web build (mobile/dist), served at the site root so the app is
// usable from any browser without Expo Go. Absent until `expo export` has run,
// in which case the API-only welcome page below takes over at '/'.
const WEB_DIR = process.env.WEB_DIR || path.resolve(__dirname, '../../mobile/dist');
const WEB_INDEX = path.join(WEB_DIR, 'index.html');
const hasWebBuild = fs.existsSync(WEB_INDEX);

if (hasWebBuild) {
  app.use(
    express.static(WEB_DIR, {
      index: false,
      // Hashed asset filenames can cache hard; index.html must not.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
      maxAge: '1h',
    })
  );
}

// API Welcome Route
app.get(['/api', ...(hasWebBuild ? [] : ['/'])], (_req: Request, res: Response) => {
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

// SPA fallback: expo-router owns client-side routing, so any non-API GET that
// reached this far is a deep link into the web app, not a missing endpoint.
if (hasWebBuild) {
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(WEB_INDEX);
  });
}

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
