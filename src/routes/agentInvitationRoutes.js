import express from 'express';
import { authenticateUserJwt } from '../middleware/callCenterAuth.js';
import callCenterAgentService from '../services/callCenterAgentService.js';

const router = express.Router();
router.use(authenticateUserJwt);

const userIdOf = (req) => req.user?.userId || req.user?.id || req.user?._id;

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Request failed' });
  }
};

router.get('/mine', handle((req) => callCenterAgentService.listMyInvitations(userIdOf(req))));
router.post('/:id/accept', handle((req) => callCenterAgentService.respondToInvitation(userIdOf(req), req.params.id, true)));
router.post('/:id/decline', handle((req) => callCenterAgentService.respondToInvitation(userIdOf(req), req.params.id, false)));

export default router;
