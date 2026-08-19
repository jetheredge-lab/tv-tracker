import { Router } from 'express';
import { getMovieDetails, getTrendingMovies, searchMovies } from '../controllers/moviesController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/movies/search?q=
router.get('/search', searchMovies);

// GET /api/movies/trending
router.get('/trending', getTrendingMovies);

// GET /api/movies/:tmdbId - declared last so it cannot swallow the paths above.
// optionalAuth because the payload is public, but a signed-in caller gets their
// own subscriptions reflected in the availability badges.
router.get('/:tmdbId', optionalAuth, getMovieDetails);

export default router;
