import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import schedulerService from '../services/scheduler.js';

export const syncUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email, pushToken, preferredRegion = 'US' } = req.body;

    if (!userId && !email) {
      res.status(400).json({ error: 'userId or email is required' });
      return;
    }

    const targetId = userId || `user_${Date.now()}`;

    const user = await prisma.user.upsert({
      where: { id: targetId },
      update: {
        ...(email ? { email } : {}),
        ...(pushToken ? { pushToken } : {}),
        ...(preferredRegion ? { preferredRegion } : {}),
      },
      create: {
        id: targetId,
        email: email || null,
        pushToken: pushToken || null,
        preferredRegion,
      },
      include: {
        _count: {
          select: { watchlists: true },
        },
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('[userController] syncUser error:', error);
    res.status(500).json({ error: 'Failed to sync user', message: (error as Error).message });
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

export const triggerCron = async (req: Request, res: Response): Promise<void> => {
  try {
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
