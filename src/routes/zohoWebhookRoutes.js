import express from 'express';
import { createZohoWebhookAuth } from '../middleware/zohoWebhookAuth.js';
import { createSyncUserHandler } from '../controllers/zohoUserSyncController.js';

export function createZohoWebhookRouter(opts = {}) {
  const router = express.Router();
  // Zoho peut envoyer du JSON (déjà géré globalement) ou un formulaire.
  router.use(express.urlencoded({ extended: false, limit: '20kb' }));
  router.post('/sync-user', createZohoWebhookAuth(opts.getSecret), createSyncUserHandler(opts));
  return router;
}

export default createZohoWebhookRouter();
