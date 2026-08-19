import { Router } from 'express';
import { getMovieDetails, getTrendingMovies, searchMovies } from '../controllers/moviesController.js';

const router = Router();

// GET /api/movies/search?q=
router.get('/search', searchMovies);

// GET /api/movies/trending
router.get('/trending', getTrendingMovies);

// GET /api/movies/:tmdbId - declared last so it cannot swallow the paths above.
router.get('/:tmdbId', getMovieDetails);

export default router;
