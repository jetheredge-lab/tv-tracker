import { Router } from 'express';
import {
  getUserProfile,
  syncUser,
  triggerCron,
  updatePreferences,
} from '../controllers/userController.js';

const router = Router();

// POST /api/users/sync
router.post('/sync', syncUser);

// GET /api/users/:userId
router.get('/:userId', getUserProfile);

// PATCH /api/users/:userId
router.patch('/:userId', updatePreferences);

// POST /api/cron/trigger (Manual testing)
router.post('/cron/trigger', triggerCron);

export default router;
