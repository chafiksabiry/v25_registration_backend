import express from 'express';
import {
  adminLogin,
  adminStats,
  adminUsers,
  adminUserDetail,
  adminUserFinancials,
  adminWalletOverview,
  adminMinutesPricing,
  adminUpdateMinutesPricing,
  adminPhoneLinePricing,
  adminUpdatePhoneLinePricing,
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.post('/login', adminLogin);
router.get('/stats', authenticate, requireAdmin, adminStats);
router.get('/users', authenticate, requireAdmin, adminUsers);
router.get('/users/:userId', authenticate, requireAdmin, adminUserDetail);
router.patch('/users/:userId/financials', authenticate, requireAdmin, adminUserFinancials);
router.get('/wallet/overview', authenticate, requireAdmin, adminWalletOverview);
router.get('/pricing/minutes', authenticate, requireAdmin, adminMinutesPricing);
router.patch('/pricing/minutes', authenticate, requireAdmin, adminUpdateMinutesPricing);
router.get('/pricing/phone-line', authenticate, requireAdmin, adminPhoneLinePricing);
router.patch('/pricing/phone-line', authenticate, requireAdmin, adminUpdatePhoneLinePricing);

export default router;
