import { Router } from 'express';
import { getIcsFeed, getCalendarEpisodes } from '../controllers/calendarController.js';
import { authenticateToken, requireSelf } from '../middleware/auth.js';

const router = Router();

// GET /api/calendar/feed/:icsToken.ics
// Public by design - calendar clients cannot authenticate. The opaque token IS
// the credential, which is why it is not the userId.
router.get('/feed/:icsToken.ics', getIcsFeed);

// In-app calendar data is normal private API traffic.
router.get('/:userId/episodes', authenticateToken, requireSelf, getCalendarEpisodes);

export default router;
