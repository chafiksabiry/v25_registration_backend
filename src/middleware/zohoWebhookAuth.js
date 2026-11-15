import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

/**
 * Authentifie les appels du webhook Zoho par un secret partagé (variable ZOHO_WEBHOOK_SECRET).
 * Le jeton se transmet dans l'en-tête `X-Zoho-Webhook-Token` (ou `Authorization: Bearer <jeton>`).
 * Repli moins sûr : paramètre `token` dans l'URL ou le corps (le secret peut alors apparaître dans les journaux HTTP).
 * Fail-closed : sans secret configuré (ou trop court), la route répond 503 et n'écrit rien.
 */
export function createZohoWebhookAuth(getSecret = () => process.env.ZOHO_WEBHOOK_SECRET, log = console.warn) {
  return (req, res, next) => {
    const secret = getSecret();
    if (!secret || String(secret).length < 24) {
      return res.status(503).json({ ok: false, error: 'webhook_not_configured' });
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
    // En-tête recommandé. Repli pour les écrans Zoho sans section « Header » : paramètre `token` (URL ou corps).
    const param = [req.query?.token, req.body?.token].find((v) => typeof v === 'string' && v.length > 0);
    const provided = req.get('x-zoho-webhook-token') || bearer || param || '';
    // Comparaison en temps constant sur des empreintes de même longueur.
    if (!provided || !crypto.timingSafeEqual(digest(provided), digest(secret))) {
      // Diagnostic sans donnée sensible : forme de la requête uniquement (jamais de valeurs).
      log('[zoho-webhook] 401', JSON.stringify({
        contentType: String(req.get('content-type') || '').split(';')[0] || null,
        queryKeys: Object.keys(req.query || {}).slice(0, 20),
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 20) : [],
        bodyType: req.body === undefined ? 'undefined' : typeof req.body,
        hasHeaderToken: Boolean(req.get('x-zoho-webhook-token')),
        hasBearer: Boolean(bearer),
        tokenLength: provided ? String(provided).length : 0,
      }));
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    return next();
  };
}
