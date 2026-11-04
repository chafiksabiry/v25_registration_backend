// Pure helpers for the "send me my one-click link" request used by the re-engagement e-mail.
// The e-mail points every REP to the same public page; the personal link is then e-mailed
// to the address typed there, which proves mailbox ownership (no secret in the campaign).

export const IMPORT_SOURCE = 'harx_v1_import';
export const REQUEST_COOLDOWN_MS = 60 * 1000;
export const DEFAULT_LINK_TTL_HOURS = 24;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Only migrated HARX v1 reps may ask for this link. */
export function isEligibleForReengageLink(user) {
  return Boolean(user && user.typeUser === 'rep' && user.source === IMPORT_SOURCE);
}

/** Avoids mail bombing a mailbox: one new link per cooldown window per account. */
export function canIssueNewLink(user, now = new Date(), cooldownMs = REQUEST_COOLDOWN_MS) {
  const last = user?.reengagement?.lastRequestedAt;
  if (!last) return true;
  return now.getTime() - new Date(last).getTime() >= cooldownMs;
}

/** Front-end origin (no trailing slash, no /auth suffix) where /auth/reactivate lives. */
export function reengageLinkBase(env = process.env) {
  const raw = env.REENGAGE_LINK_BASE || env.FRONTEND_URL || env.VITE_FRONTEND_URL || 'https://harx.ai';
  return String(raw).trim().replace(/\/+$/, '').replace(/\/auth$/, '');
}

export function buildReengageLink(base, token) {
  return `${base}/auth/reactivate?t=${encodeURIComponent(token)}`;
}

export function linkTtlHours(env = process.env) {
  const n = Number(env.REENGAGE_LINK_TTL_HOURS);
  return Number.isFinite(n) && n >= 1 && n <= 24 * 30 ? n : DEFAULT_LINK_TTL_HOURS;
}
