import { Router } from 'express';
import { claimAccount, getMe, login, register } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/claim (Protected) - turn the caller's existing anonymous
// account into a real one, in place, so its watchlist survives.
router.post('/claim', authenticateToken, claimAccount);

// GET /api/auth/me (Protected)
router.get('/me', authenticateToken, getMe);

export default router;
