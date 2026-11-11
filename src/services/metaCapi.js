import crypto from 'node:crypto';

/**
 * API de conversions Meta (CAPI) : envoie l'évènement CompleteRegistration côté serveur, en plus du pixel du navigateur.
 * - Uniquement si META_CAPI_TOKEN est défini ET si le visiteur a donné le consentement « marketing » (marketingConsent === true).
 * - Même `event_id` que le navigateur : Meta déduplique les deux envois.
 * - Données minimales : e-mail haché (SHA-256, minuscules sans espaces), IP, navigateur, cookies _fbp/_fbc. Jamais de nom, de
 *   téléphone, de pièce d'identité ni de justificatif.
 * - Ne bloque et ne fait jamais échouer l'inscription : toute erreur est seulement journalisée.
 */

const PIXEL_ID = process.env.META_PIXEL_ID || '340901355517689';

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const clean = (v, max = 512) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Construit le corps de l'appel, ou null si l'envoi n'est pas permis. */
export function buildCapiPayload({ email, eventId, marketingConsent, ip, userAgent, fbp, fbc, sourceUrl, now = Date.now(), testEventCode }) {
  if (marketingConsent !== true) return null;
  const id = clean(eventId, 100);
  const mail = clean(email, 320);
  if (!id || !mail) return null;
  const user_data = {
    em: [sha256(mail.toLowerCase().replace(/\s+/g, ''))],
    client_ip_address: clean(ip, 64),
    client_user_agent: clean(userAgent, 512),
    fbp: clean(fbp, 200),
    fbc: clean(fbc, 200),
  };
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);
  const body = {
    data: [
      {
        event_name: 'CompleteRegistration',
        event_time: Math.floor(now / 1000),
        event_id: id,
        action_source: 'website',
        event_source_url: clean(sourceUrl, 1000) || 'https://harx.ai/',
        user_data,
      },
    ],
  };
  if (testEventCode) body.test_event_code = testEventCode;
  return body;
}

/** Fire-and-forget : renvoie une promesse qui ne rejette jamais. */
export async function sendSignUpEvent(input, { token = process.env.META_CAPI_TOKEN, fetchImpl = globalThis.fetch, testEventCode = process.env.META_CAPI_TEST_CODE } = {}) {
  try {
    if (!token) return { sent: false, reason: 'no-token' };
    const payload = buildCapiPayload({ ...input, testEventCode: testEventCode || undefined });
    if (!payload) return { sent: false, reason: 'not-permitted' };
    const version = process.env.META_GRAPH_VERSION ? `/${process.env.META_GRAPH_VERSION}` : '';
    const res = await fetchImpl(`https://graph.facebook.com${version}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('[meta-capi] refus de Meta :', res.status);
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.warn('[meta-capi] envoi impossible :', e?.message);
    return { sent: false, reason: 'error' };
  }
}
