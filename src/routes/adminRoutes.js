import express from 'express';
import {
  adminLogin,
  adminStats,
  adminUsers,
  adminUserDetail,
  adminUserFinancials,
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.post('/login', adminLogin);
router.get('/stats', authenticate, requireAdmin, adminStats);
router.get('/users', authenticate, requireAdmin, adminUsers);
router.get('/users/:userId', authenticate, requireAdmin, adminUserDetail);
router.patch('/users/:userId/financials', authenticate, requireAdmin, adminUserFinancials);

export default router;
