import crypto from 'crypto';

/** Vérifie l'en-tête X-Hub-Signature-256 envoyé par Meta (HMAC-SHA256 du corps brut avec l'App Secret). */
export function isValidMetaSignature(rawBody, header, appSecret) {
  if (!rawBody || !header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
