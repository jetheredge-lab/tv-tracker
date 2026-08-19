import { Router } from 'express';
import { listProviders } from '../controllers/subscriptionsController.js';

const router = Router();

// GET /api/providers?region=US
router.get('/', listProviders);

export default router;
