import { Router } from 'express';
import {
  getUserWatchlist,
  addToWatchlist,
  updateWatchlist,
  removeFromWatchlist,
} from '../controllers/watchlistController.js';
import { authenticateToken, requireSelf } from '../middleware/auth.js';

const router = Router();

// A watchlist is private data, so every route here requires a token. The
// controllers already prefer req.user.userId over anything in the request, so
// a caller cannot act on someone else by passing a different id in the body.
router.use(authenticateToken);

router.get('/', getUserWatchlist);
router.get('/:userId', requireSelf, getUserWatchlist);

router.post('/', addToWatchlist);

// :id here is a watchlist item, not a user - the controllers verify the item
// belongs to req.user.userId before touching it.
router.patch('/:id', updateWatchlist);
router.delete('/:id', removeFromWatchlist);

export default router;
