import { Router } from 'express';
import {
  dismissRecommendation,
  getPersonalizedRecommendations,
} from '../controllers/recommendationController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.use(optionalAuth);

// GET /api/recommendations (or /api/recommendations/:userId)
router.get('/', getPersonalizedRecommendations);
router.get('/:userId', getPersonalizedRecommendations);

// POST /api/recommendations/dismiss
router.post('/dismiss', dismissRecommendation);

export default router;
