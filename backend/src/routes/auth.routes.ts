import { Router } from 'express';
import { getMe, login, register } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me (Protected)
router.get('/me', authenticateToken, getMe);

export default router;
