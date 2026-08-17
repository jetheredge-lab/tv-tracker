import { Router } from 'express';
import {
  getPersonalizedRecommendations,
  dismissRecommendation,
} from '../controllers/recommendationController.js';
import { authenticateToken, requireSelf } from '../middleware/auth.js';

const router = Router();

// Recommendations are derived from a user's watchlist, so they are personal.
router.use(authenticateToken);

router.get('/', getPersonalizedRecommendations);
router.get('/:userId', requireSelf, getPersonalizedRecommendations);

router.post('/dismiss', dismissRecommendation);

export default router;
