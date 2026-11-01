import express from 'express';
import { authenticateCallCenter, authenticateUserJwt } from '../middleware/callCenterAuth.js';
import {
  createCallCenterAgent,
  listCallCenterAgents,
  resendCallCenterAgentInvite,
  removeCallCenterAgentInvitation,
  removeCallCenterAgentEmployment,
} from '../controllers/callCenterAgentController.js';

import {
  archiveClient,
  createClient,
  deleteClient,
  listClients,
  listOperationClients,
  listOperationProfiles,
  restoreClient,
  saveOnboardingFeedback,
  setOperationClient,
  setOperationProfile,
  updateClient,
  getWorkspaceState,
  saveWorkspaceState,
} from '../controllers/callCenterClientController.js';

import {
  cancelRequest,
  createRequest,
  decideRequest,
  listAgentShifts,
  listMyRequests,
  listMyShifts,
  listRequests,
  setAgentShifts,
} from '../controllers/callCenterScheduleController.js';

import {
  getBranding,
  inviteClientContact,
  listClientAccess,
  resendClientInvitation,
  revokeClientAccess,
  setBranding,
  updateClientAccess,
} from '../controllers/callCenterClientPortalController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/agents', listCallCenterAgents);
router.post('/agents', createCallCenterAgent);
router.post('/agents/:userId/resend-invite', resendCallCenterAgentInvite);
router.delete('/agents/:userId', removeCallCenterAgentInvitation);
// Retire l'agent de CE centre seulement (ses autres centres ne sont pas touchés).
router.delete('/agents/:userId/employment', removeCallCenterAgentEmployment);

// Clients du centre et rattachement client / opération
router.get('/clients', listClients);
router.post('/clients', createClient);
router.put('/clients/:id', updateClient);
router.post('/clients/:id/archive', archiveClient);
router.post('/clients/:id/restore', restoreClient);
router.delete('/clients/:id', deleteClient);
router.get('/operation-clients', listOperationClients);
router.put('/operation-clients/:gigId', setOperationClient);

// Portail client (multi-clients) : marque blanche et accès en lecture seule des contacts d'un client.
// Jeton de connexion exigé (pas de repli sur un en-tête d'identifiant), propriétaire du centre uniquement.
router.get('/branding', authenticateUserJwt, getBranding);
router.put('/branding', authenticateUserJwt, setBranding);
router.get('/client-access', authenticateUserJwt, listClientAccess);
router.post('/client-access', authenticateUserJwt, inviteClientContact);
router.patch('/client-access/:userId', authenticateUserJwt, updateClientAccess);
router.post('/client-access/:userId/resend', authenticateUserJwt, resendClientInvitation);
router.delete('/client-access/:userId', authenticateUserJwt, revokeClientAccess);

// Avis sur la mise en route
router.post('/onboarding-feedback', saveOnboardingFeedback);

// Fiche d'une opération : objectif, volume attendu et indicateurs de pilotage
router.get('/operation-profiles', listOperationProfiles);
router.put('/operation-profiles/:gigId', setOperationProfile);

// État du portail conservé côté serveur (files, mise en route, lignes testées ; académie et préférences de la personne)
router.get('/workspace-state', getWorkspaceState);
router.put('/workspace-state', saveWorkspaceState);

// Planning des agents : l'agent lit son planning et fait ses demandes ; le centre planifie et répond
router.get('/schedule/my-shifts', listMyShifts);
router.get('/schedule/my-requests', listMyRequests);
router.post('/schedule/requests', createRequest);
router.post('/schedule/requests/:id/cancel', cancelRequest);
router.get('/schedule/shifts', listAgentShifts);
router.put('/schedule/agents/:userId/shifts', setAgentShifts);
router.get('/schedule/requests', listRequests);
router.post('/schedule/requests/:id/decision', decideRequest);

export default router;
