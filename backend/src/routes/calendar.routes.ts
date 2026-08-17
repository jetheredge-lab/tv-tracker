import { Router } from 'express';
import { getCalendarEpisodes, getIcsFeed } from '../controllers/calendarController.js';

const router = Router();

// GET /api/calendar/:userId/feed.ics (Dynamic RFC-5545 iCalendar feed)
router.get('/:userId/feed.ics', getIcsFeed);

// GET /api/calendar/:userId/episodes (JSON structured schedule)
router.get('/:userId/episodes', getCalendarEpisodes);

export default router;
