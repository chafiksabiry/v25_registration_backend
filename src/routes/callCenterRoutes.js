import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createCallCenterAgent,
  listCallCenterAgents,
  resendCallCenterAgentInvite,
} from '../controllers/callCenterAgentController.js';

const router = express.Router();

router.use(authenticate);
router.get('/agents', listCallCenterAgents);
router.post('/agents', createCallCenterAgent);
router.post('/agents/:userId/resend-invite', resendCallCenterAgentInvite);

export default router;
