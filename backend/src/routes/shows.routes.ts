import { Router } from 'express';
import {
  getShowDetails,
  getSimilarShowsForShow,
  getTrendingShows,
  searchShows,
} from '../controllers/showsController.js';

const router = Router();

// GET /api/shows/search?q=query
router.get('/search', searchShows);

// GET /api/shows/trending
router.get('/trending', getTrendingShows);

// GET /api/shows/:id/similar
router.get('/:id/similar', getSimilarShowsForShow);

// GET /api/shows/:id
router.get('/:id', getShowDetails);

export default router;
