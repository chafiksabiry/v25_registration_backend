import express from 'express';
import { adminLogin, adminStats, adminUsers } from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.post('/login', adminLogin);
router.get('/stats', authenticate, requireAdmin, adminStats);
router.get('/users', authenticate, requireAdmin, adminUsers);

export default router;
