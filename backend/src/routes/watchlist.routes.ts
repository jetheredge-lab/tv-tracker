import { Router } from 'express';
import {
  addToWatchlist,
  getUserWatchlist,
  removeFromWatchlist,
  updateWatchlist,
} from '../controllers/watchlistController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// Allow authenticated JWT or explicit userId param
router.use(optionalAuth);

// GET /api/watchlist (or /api/watchlist/:userId)
router.get('/', getUserWatchlist);
router.get('/:userId', getUserWatchlist);

// POST /api/watchlist
router.post('/', addToWatchlist);

// PATCH /api/watchlist/:id
router.patch('/:id', updateWatchlist);

// DELETE /api/watchlist/:id
router.delete('/:id', removeFromWatchlist);

export default router;
