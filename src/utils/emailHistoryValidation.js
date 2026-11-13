const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZOHO_EMAIL_ID_RE = /^[A-Za-z0-9._:-]{4,128}$/;
const DEAL_ID_RE = /^\d{6,25}$/;
// ISO 8601 avec fuseau obligatoire (Z ou +hh:mm) : une date sans fuseau est ambigue.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const MAX_BULK_ENTRIES = 100; // express.json() limite le corps a 100 ko par defaut
export const METHODS = ['workflow', 'manual', 'other'];
// Statuts acceptables pour un email DEJA envoye. `failed` en est exclu : un echec n'est pas un envoi.
export const RECORDABLE_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'bounced'];
// Transitions autorisees : on n'ecrit jamais un statut plus faible par-dessus un plus avance.
export const STATUS_TRANSITIONS = {
  delivered: ['sent'],
  opened: ['sent', 'delivered'],
  clicked: ['sent', 'delivered', 'opened'],
  bounced: ['sent'],
};

const text = (value) => {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  return out === '' ? null : out;
};

/**
 * Valide un email confirme par Zoho. L'identifiant Zoho de l'email (zohoEmailId) et la date d'envoi
 * sont obligatoires : sans eux, l'envoi n'est pas confirme et rien n'est enregistre.
 * Retourne { ok: true, value } ou { ok: false, error }.
 */
export function normalizeEmailEntry(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Entry must be an object' };
  }

  const zohoEmailId = text(raw.zohoEmailId);
  if (!zohoEmailId || !ZOHO_EMAIL_ID_RE.test(zohoEmailId)) {
    return { ok: false, error: 'zohoEmailId is required (Zoho confirmation of the sent email)' };
  }

  const recipient = String(raw.recipient ?? '').trim().toLowerCase();
  if (recipient.length > 254 || !EMAIL_RE.test(recipient)) {
    return { ok: false, error: 'recipient is invalid' };
  }

  const subject = text(raw.subject);
  if (!subject || subject.length > 500) {
    return { ok: false, error: 'subject is required (500 characters max)' };
  }

  const sentAtRaw = text(raw.sentAt);
  if (!sentAtRaw || !ISO_RE.test(sentAtRaw)) {
    return { ok: false, error: 'sentAt must be ISO 8601 with a timezone, e.g. 2026-11-13T10:30:00.000Z' };
  }
  const sentAt = new Date(sentAtRaw);
  if (Number.isNaN(sentAt.getTime())) return { ok: false, error: 'sentAt is not a valid date' };
  if (sentAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return { ok: false, error: 'sentAt is in the future' };
  }

  const dealId = text(raw.dealId);
  if (dealId && !DEAL_ID_RE.test(dealId)) return { ok: false, error: 'dealId must be a numeric Zoho id' };

  const method = text(raw.method) ?? 'workflow';
  if (!METHODS.includes(method)) return { ok: false, error: `method must be one of: ${METHODS.join(', ')}` };

  const status = text(raw.status) ?? 'sent';
  if (!RECORDABLE_STATUSES.includes(status)) {
    return { ok: false, error: `status must be one of: ${RECORDABLE_STATUSES.join(', ')}` };
  }

  const value = { zohoEmailId, subject, recipient, sentAt, source: 'zoho_crm', method, status };
  if (dealId) value.dealId = dealId;
  return { ok: true, value };
}

export function normalizeStatusUpdate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Update must be an object' };
  }
  const zohoEmailId = text(raw.zohoEmailId);
  if (!zohoEmailId || !ZOHO_EMAIL_ID_RE.test(zohoEmailId)) return { ok: false, error: 'zohoEmailId is invalid' };
  const status = text(raw.status);
  if (!status || !STATUS_TRANSITIONS[status]) {
    return { ok: false, error: `status must be one of: ${Object.keys(STATUS_TRANSITIONS).join(', ')}` };
  }
  return { ok: true, value: { zohoEmailId, status, allowedPrevious: STATUS_TRANSITIONS[status] } };
}
