import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../services/prisma.js';
import { JWT_SECRET, INVITE_REJECTION, inviteCodeAccepted } from '../config/auth.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

// Secret is validated once at startup in config/auth.ts.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, preferredRegion = 'US' } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long' });
      return;
    }

    // Registration mints a brand new account, so it is gated. Signing in is
    // not: an existing account is proof enough that someone was invited.
    if (!inviteCodeAccepted(req.body.inviteCode)) {
      res.status(403).json(INVITE_REJECTION);
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser && existingUser.passwordHash) {
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    let user;
    if (existingUser) {
      // Upgrade existing guest user profile
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          name: name || existingUser.name,
          preferredRegion,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name || null,
          preferredRegion,
        },
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.status(201).json({
      message: 'Account registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferredRegion: user.preferredRegion,
        pushAlertsEnabled: user.pushAlertsEnabled,
        emailAlertsEnabled: user.emailAlertsEnabled,
      },
    });
  } catch (error) {
    console.error('[authController] register error:', error);
    res.status(500).json({ error: 'Registration failed', message: (error as Error).message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferredRegion: user.preferredRegion,
        pushAlertsEnabled: user.pushAlertsEnabled,
        emailAlertsEnabled: user.emailAlertsEnabled,
      },
    });
  } catch (error) {
    console.error('[authController] login error:', error);
    res.status(500).json({ error: 'Login failed', message: (error as Error).message });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            watchlists: true,
            dismissedRecs: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferredRegion: user.preferredRegion,
        pushAlertsEnabled: user.pushAlertsEnabled,
        emailAlertsEnabled: user.emailAlertsEnabled,
        pushToken: user.pushToken,
        stats: {
          watchlistCount: user._count.watchlists,
          dismissedCount: user._count.dismissedRecs,
        },
      },
    });
  } catch (error) {
    console.error('[authController] getMe error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

/**
 * Attach an email + password to the account the caller is ALREADY using.
 *
 * Every device holds an anonymous account created by /api/users/sync, and that
 * is where its watchlist lives. `register` resolves an existing guest by
 * email, but anonymous accounts have no email - so registering from a device
 * that had a watchlist minted a second row and stranded the first. This claims
 * the caller's own account in place, which is what "create an account" should
 * do once a device has already been using the app.
 *
 * No invite code: holding a valid token for an account means someone was
 * already let in.
 */
export const claimAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const callerId = req.user?.userId;
    if (!callerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { email, password, name, preferredRegion } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long' });
      return;
    }

    const me = await prisma.user.findUnique({ where: { id: callerId } });
    if (!me) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (me.passwordHash) {
      res.status(409).json({
        error: 'This account already has a password',
        message: 'Sign in with your existing credentials instead.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const taken = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (taken && taken.id !== callerId) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: callerId },
      data: {
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(password, 10),
        ...(name ? { name } : {}),
        ...(preferredRegion ? { preferredRegion } : {}),
      },
    });

    // Same id as before, so the watchlist, ratings and ICS feed all carry over.
    res.status(200).json({
      message: 'Account secured successfully',
      token: jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
      ),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferredRegion: user.preferredRegion,
        pushAlertsEnabled: user.pushAlertsEnabled,
        emailAlertsEnabled: user.emailAlertsEnabled,
      },
    });
  } catch (error) {
    console.error('[authController] claimAccount error:', error);
    res.status(500).json({ error: 'Could not secure this account', message: (error as Error).message });
  }
};
