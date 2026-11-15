import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

/**
 * Authentifie les appels du webhook Zoho par un secret partagé (variable ZOHO_WEBHOOK_SECRET).
 * Le jeton se transmet dans l'en-tête `X-Zoho-Webhook-Token` (ou `Authorization: Bearer <jeton>`).
 * Fail-closed : sans secret configuré (ou trop court), la route répond 503 et n'écrit rien.
 */
export function createZohoWebhookAuth(getSecret = () => process.env.ZOHO_WEBHOOK_SECRET) {
  return (req, res, next) => {
    const secret = getSecret();
    if (!secret || String(secret).length < 24) {
      return res.status(503).json({ ok: false, error: 'webhook_not_configured' });
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
    const provided = req.get('x-zoho-webhook-token') || bearer || '';
    // Comparaison en temps constant sur des empreintes de même longueur.
    if (!provided || !crypto.timingSafeEqual(digest(provided), digest(secret))) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    return next();
  };
}
