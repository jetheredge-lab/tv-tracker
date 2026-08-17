import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Requests reach this server through the Cloudflare Tunnel, and cloudflared
 * connects over loopback - so req.ip is always 127.0.0.1 and every client in
 * the world would share a single rate-limit bucket. Cloudflare sets
 * CF-Connecting-IP to the real client address, so key on that instead.
 *
 * That header is only trustworthy because the server binds to loopback (see
 * index.ts): nothing but cloudflared can reach the port, so an outside client
 * cannot set the header itself. If the port is ever exposed directly, this
 * becomes spoofable and the limiter becomes bypassable.
 *
 * ipKeyGenerator normalises IPv6 addresses onto a subnet, so a client with a
 * /64 worth of addresses cannot trivially sidestep the limit.
 */
const clientIpKey = (req: Request): string =>
  ipKeyGenerator(req.header('cf-connecting-ip') ?? req.ip ?? '');

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Broad ceiling for the whole API. Deliberately generous: a browsing session
 * makes a lot of calls, and mobile clients behind carrier NAT share an IP.
 * This is an abuse ceiling, not a usage quota.
 */
export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  // Keep uptime checks unmetered.
  skip: (req) => req.path === '/health',
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please slow down and try again shortly.',
  },
});

/**
 * Credential endpoints get a much tighter budget. skipSuccessfulRequests means
 * only FAILED attempts count, so a legitimate user is never locked out by
 * normal use while credential stuffing is throttled hard.
 */
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: {
    error: 'Too Many Requests',
    message: 'Too many attempts. Please try again in 15 minutes.',
  },
});
