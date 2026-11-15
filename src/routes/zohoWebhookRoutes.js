import express from 'express';
import multer from 'multer';
import { createZohoWebhookAuth } from '../middleware/zohoWebhookAuth.js';
import { createSyncUserHandler } from '../controllers/zohoUserSyncController.js';

/** Corps en texte brut : JSON (`{"a":"b"}`) ou paires `a=b&c=d`. Tout autre texte est ignoré (le corps reste vide). */
export function textBodyToObject(req, _res, next) {
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    let parsed = {};
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j;
    } catch {
      if (/^[^=\s&]+=/.test(raw)) parsed = Object.fromEntries(new URLSearchParams(raw));
    }
    req.body = parsed;
  }
  next();
}

export function createZohoWebhookRouter(opts = {}) {
  const router = express.Router();
  // Zoho peut envoyer du JSON (déjà géré globalement), un formulaire, du multipart/form-data ou du texte brut.
  router.use(express.urlencoded({ extended: false, limit: '20kb' }));
  const form = multer({ limits: { fileSize: 1, files: 0, fields: 30, fieldSize: 4096 } });
  router.use((req, res, next) => form.none()(req, res, (err) => (err ? res.status(400).json({ ok: false, error: 'invalid_form' }) : next())));
  router.use(express.text({ type: 'text/plain', limit: '20kb' }));
  router.use(textBodyToObject);
  router.post('/sync-user', createZohoWebhookAuth(opts.getSecret, opts.log), createSyncUserHandler(opts));
  return router;
}

export default createZohoWebhookRouter();
