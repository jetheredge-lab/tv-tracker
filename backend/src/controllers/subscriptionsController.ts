import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { canonicalProviderName, getProviderCatalog } from '../services/providers.js';

/** GET /api/providers?region=US - the list the subscriptions picker is built from. */
export const listProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const region = ((req.query.region as string) || 'US').toUpperCase();
    const providers = await getProviderCatalog(region);
    res.json({ region, providers });
  } catch (error) {
    console.error('[subscriptionsController] listProviders error:', error);
    res.status(500).json({ error: 'Failed to load streaming providers' });
  }
};

/**
 * GET /api/users/:userId/subscriptions
 *
 * `configured` is the important field. An empty list with configured=false
 * means "never asked", and an empty list with configured=true means "I pay for
 * nothing" - the client renders those two states very differently.
 */
export const getSubscriptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionsSetAt: true, preferredRegion: true },
    });
    const region = ((req.query.region as string) || user?.preferredRegion || 'US').toUpperCase();

    const rows = await prisma.userSubscription.findMany({
      where: { userId, region },
      orderBy: { providerName: 'asc' },
      select: { providerId: true, providerName: true },
    });

    res.json({
      configured: Boolean(user?.subscriptionsSetAt),
      region,
      subscriptions: rows,
    });
  } catch (error) {
    console.error('[subscriptionsController] getSubscriptions error:', error);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
};

/**
 * PUT /api/users/:userId/subscriptions
 *
 * Replaces the set for one region. Saving an empty list is a legitimate answer
 * and is recorded as such: subscriptionsSetAt is stamped either way, which is
 * what separates "pays for nothing" from "has not been asked".
 */
export const putSubscriptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const { subscriptions, region: bodyRegion } = req.body as {
      subscriptions?: Array<{ providerId?: number; providerName?: string }>;
      region?: string;
    };

    if (!Array.isArray(subscriptions)) {
      res.status(400).json({ error: 'subscriptions must be an array' });
      return;
    }

    const region = (bodyRegion || 'US').toUpperCase();

    // Canonicalise on the way in so a stored name always matches what
    // availability rows carry, whatever the client happened to send.
    const seen = new Set<string>();
    const rows: Array<{ userId: string; providerId: number; providerName: string; region: string }> = [];
    for (const s of subscriptions) {
      const providerName = canonicalProviderName(s?.providerName || '');
      const providerId = Number(s?.providerId);
      if (!providerName || !Number.isFinite(providerId) || seen.has(providerName)) continue;
      seen.add(providerName);
      rows.push({ userId, providerId, providerName, region });
    }

    await prisma.$transaction([
      prisma.userSubscription.deleteMany({ where: { userId, region } }),
      ...(rows.length ? [prisma.userSubscription.createMany({ data: rows, skipDuplicates: true })] : []),
      prisma.user.update({ where: { id: userId }, data: { subscriptionsSetAt: new Date() } }),
    ]);

    res.json({ configured: true, region, subscriptions: rows.map(({ providerId, providerName }) => ({ providerId, providerName })) });
  } catch (error) {
    console.error('[subscriptionsController] putSubscriptions error:', error);
    res.status(500).json({ error: 'Failed to save subscriptions', message: (error as Error).message });
  }
};
