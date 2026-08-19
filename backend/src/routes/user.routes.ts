import { Router } from 'express';
import {
  syncUser,
  getUserProfile,
  updatePreferences,
  deleteAccount,
  triggerCron,
} from '../controllers/userController.js';
import { authenticateToken, optionalAuth, requireSelf } from '../middleware/auth.js';
import { getSubscriptions, putSubscriptions } from '../controllers/subscriptionsController.js';

const router = Router();

// POST /api/users/sync - bootstrap. Unauthenticated by necessity: this is how
// a device claims its account and receives its first token. The device secret
// in the body is what authorises it.
router.post('/sync', optionalAuth, syncUser);

// Everything below operates on a specific account, so it needs both a valid
// token and a check that the token belongs to the account being touched.
router.get('/:userId', authenticateToken, requireSelf, getUserProfile);
router.patch('/:userId', authenticateToken, requireSelf, updatePreferences);

// Declared before /:userId so the id route cannot swallow them.
router.get('/:userId/subscriptions', authenticateToken, requireSelf, getSubscriptions);
router.put('/:userId/subscriptions', authenticateToken, requireSelf, putSubscriptions);

// DELETE /api/users/:userId - required by Google Play for apps with accounts.
router.delete('/:userId', authenticateToken, requireSelf, deleteAccount);

// Gated internally by CRON_SECRET; disabled when that is unset.
router.post('/cron/trigger', triggerCron);

export default router;
