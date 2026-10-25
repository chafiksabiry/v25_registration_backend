import express from 'express';
import { authenticateCallCenter } from '../middleware/callCenterAuth.js';
import {
  createCallCenterAgent,
  listCallCenterAgents,
  resendCallCenterAgentInvite,
} from '../controllers/callCenterAgentController.js';

import {
  archiveClient,
  createClient,
  deleteClient,
  listClients,
  listOperationClients,
  restoreClient,
  setOperationClient,
  updateClient,
} from '../controllers/callCenterClientController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/agents', listCallCenterAgents);
router.post('/agents', createCallCenterAgent);
router.post('/agents/:userId/resend-invite', resendCallCenterAgentInvite);

// Clients du centre et rattachement client / opération
router.get('/clients', listClients);
router.post('/clients', createClient);
router.put('/clients/:id', updateClient);
router.post('/clients/:id/archive', archiveClient);
router.post('/clients/:id/restore', restoreClient);
router.delete('/clients/:id', deleteClient);
router.get('/operation-clients', listOperationClients);
router.put('/operation-clients/:gigId', setOperationClient);

export default router;
