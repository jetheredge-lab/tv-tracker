import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/auth.js';

export interface AuthPayload {
  userId: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const extractToken = (req: Request): string | null => {
  const header = req.headers['authorization'];
  return header && header.startsWith('Bearer ') ? header.substring(7) : null;
};

/**
 * Rejects requests without a valid Bearer JWT.
 */
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Access denied. No authentication token provided.',
    });
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token.',
    });
  }
};

/**
 * Attaches the user when a valid token is present, but allows guests through.
 * Only appropriate on routes that expose no user-specific data.
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // An invalid optional token is simply ignored.
    }
  }
  next();
};

/**
 * Ensures the caller may only act on their own record.
 *
 * Must run AFTER authenticateToken. Routes carry the target in :userId, and
 * without this check a valid token for user A could read or modify user B
 * simply by changing the path.
 */
export const requireSelf = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const caller = req.user?.userId;

  if (!caller) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    return;
  }

  const target = req.params.userId;
  if (target && target !== caller) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You may only access your own account.',
    });
    return;
  }

  next();
};
