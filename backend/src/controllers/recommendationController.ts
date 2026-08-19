import { Response } from 'express';
import recommendationEngine from '../services/recommendation.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const getPersonalizedRecommendations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Pull-to-refresh should be able to bypass the 3h row cache.
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

    const sections = await recommendationEngine.getPersonalizedRecommendations(userId, { refresh });
    res.json({ sections });
  } catch (error) {
    console.error('[recommendationController] getPersonalizedRecommendations error:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: (error as Error).message,
    });
  }
};

export const dismissRecommendation = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId || req.body.userId;
    const { tvmazeId, showId } = req.body;

    if (!userId || (!tvmazeId && !showId)) {
      res.status(400).json({ error: 'userId and either tvmazeId or showId are required' });
      return;
    }

    await recommendationEngine.dismissRecommendation(
      userId,
      tvmazeId ? Number(tvmazeId) : undefined,
      showId
    );

    res.json({ success: true, message: 'Recommendation dismissed' });
  } catch (error) {
    console.error('[recommendationController] dismissRecommendation error:', error);
    res.status(500).json({
      error: 'Failed to dismiss recommendation',
      message: (error as Error).message,
    });
  }
};
