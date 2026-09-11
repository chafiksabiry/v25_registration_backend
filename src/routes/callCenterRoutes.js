import express from 'express';
import { authenticateCallCenter } from '../middleware/callCenterAuth.js';
import {
  createCallCenterAgent,
  listCallCenterAgents,
  resendCallCenterAgentInvite,
} from '../controllers/callCenterAgentController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/agents', listCallCenterAgents);
router.post('/agents', createCallCenterAgent);
router.post('/agents/:userId/resend-invite', resendCallCenterAgentInvite);

export default router;
