import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../services/prisma.js';
import schedulerService from '../services/scheduler.js';
import { signUserToken } from '../config/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

/** Opaque, unguessable token for the .ics subscription URL. */
const newIcsToken = (): string => crypto.randomBytes(24).toString('hex');


export const syncUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId, deviceSecret, email, pushToken, preferredRegion = 'US' } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // The device secret is what makes the account actually private: the userId
    // travels in URLs and logs, so on its own it can never be the credential.
    if (typeof deviceSecret !== 'string' || deviceSecret.length < 16) {
      res.status(400).json({
        error: 'deviceSecret is required',
        message: 'Send a device secret of at least 16 characters to claim this account.',
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });

    // A valid token for this account is equivalent proof of ownership: a user
    // who signs in on a second device holds the token but not the first
    // device's secret, and must still be able to sync.
    const tokenProvesOwnership = req.user?.userId === userId;

    if (existing?.deviceSecretHash && !tokenProvesOwnership) {
      const matches = await bcrypt.compare(deviceSecret, existing.deviceSecretHash);
      if (!matches) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'This account is claimed by another device.',
        });
        return;
      }
    }

    const claim = existing?.deviceSecretHash && !tokenProvesOwnership
      ? {}
      : // Either brand new, or an account created before device secrets existed.
        // Trust-on-first-use binds it to whichever device syncs next, which is
        // how existing installs migrate without losing their watchlist.
        { deviceSecretHash: await bcrypt.hash(deviceSecret, SALT_ROUNDS) };

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        ...claim,
        ...(existing?.icsToken ? {} : { icsToken: newIcsToken() }),
        ...(email ? { email } : {}),
        ...(pushToken ? { pushToken } : {}),
        ...(preferredRegion ? { preferredRegion } : {}),
      },
      create: {
        id: userId,
        ...claim,
        icsToken: newIcsToken(),
        email: email || null,
        pushToken: pushToken || null,
        preferredRegion,
      },
      include: {
        _count: { select: { watchlists: true } },
      },
    });

    // Never return the secret hash to the client.
    const { deviceSecretHash: _omit, passwordHash: _omit2, ...safeUser } = user;

    res.json({ user: safeUser, token: signUserToken(user.id, user.email) });
  } catch (error) {
    console.error('[userController] syncUser error:', error);
    res.status(500).json({ error: 'Failed to sync user', message: (error as Error).message });
  }
};

/**
 * Permanent account deletion.
 *
 * Google Play requires this for any app offering account creation. Watchlist
 * and DismissedRecommendation both declare onDelete: Cascade, so removing the
 * user row takes all associated data with it.
 */
export const deleteAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await prisma.user.delete({ where: { id: userId } });

    res.json({
      success: true,
      message: 'Account and all associated data permanently deleted.',
    });
  } catch (error) {
    console.error('[userController] deleteAccount error:', error);
    res.status(500).json({ error: 'Failed to delete account', message: (error as Error).message });
  }
};

export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { email, pushToken, pushAlertsEnabled, emailAlertsEnabled, preferredRegion } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const dataToUpdate: Record<string, any> = {};
    if (email !== undefined) dataToUpdate.email = email || null;
    if (pushToken !== undefined) dataToUpdate.pushToken = pushToken || null;
    if (pushAlertsEnabled !== undefined) dataToUpdate.pushAlertsEnabled = Boolean(pushAlertsEnabled);
    if (emailAlertsEnabled !== undefined) dataToUpdate.emailAlertsEnabled = Boolean(emailAlertsEnabled);
    if (preferredRegion !== undefined) dataToUpdate.preferredRegion = preferredRegion;

    const user = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    res.json({ user });
  } catch (error) {
    console.error('[userController] updatePreferences error:', error);
    res.status(500).json({ error: 'Failed to update user preferences', message: (error as Error).message });
  }
};

export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { watchlists: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('[userController] getUserProfile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

/**
 * Manual cron trigger. Runs the full daily episode sync - external API calls,
 * push notifications and email - so leaving it open let anyone on the internet
 * burn API quota and spam users. Requires a shared secret, and is disabled
 * outright when CRON_SECRET is unset.
 */
export const triggerCron = async (req: Request, res: Response): Promise<void> => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    if (req.header('x-cron-secret') !== cronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { targetDate } = req.body || {};
    console.log('[userController] Manual cron trigger received...');
    const results = await schedulerService.runDailyEpisodeSync(targetDate);
    res.json({
      success: true,
      message: 'Cron job executed successfully',
      results,
    });
  } catch (error) {
    console.error('[userController] triggerCron error:', error);
    res.status(500).json({ error: 'Failed to run cron job', message: (error as Error).message });
  }
};
