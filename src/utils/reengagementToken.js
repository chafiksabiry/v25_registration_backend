import crypto from 'crypto';

/** Random URL-safe token (43 chars) to put in the one-click re-engagement link. */
export function generateReengagementToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Only this hash is stored on the user; the raw token exists in the e-mailed link. */
export function hashReengagementToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
