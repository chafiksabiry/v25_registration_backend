import { waConfig, isWhatsappAgentConfigured } from '../services/whatsappAgent/config.js';
import { isValidMetaSignature } from '../services/whatsappAgent/signature.js';
import { handleIncomingMessage } from '../services/whatsappAgent/messageHandler.js';

/** GET : vérification initiale du webhook par Meta. */
export const verifyWebhook = (req, res) => {
  const { verifyToken } = waConfig();
  if (verifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).send(String(req.query['hub.challenge']));
  }
  return res.sendStatus(403);
};

/** POST : messages entrants. On répond 200 tout de suite à Meta, puis on traite en arrière-plan. */
export const receiveWebhook = (req, res) => {
  if (!isWhatsappAgentConfigured()) return res.sendStatus(503);
  if (!isValidMetaSignature(req.rawBody, req.get('x-hub-signature-256'), waConfig().appSecret)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);

  const messages = (req.body?.entry || [])
    .flatMap((e) => e.changes || [])
    .flatMap((c) => c.value?.messages || []);

  for (const msg of messages) {
    handleIncomingMessage(msg).catch((err) => console.error('[whatsapp-agent] traitement échoué:', err.message));
  }
};
