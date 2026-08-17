import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../services/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tvtracker-jwt-secret-key-default';
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
