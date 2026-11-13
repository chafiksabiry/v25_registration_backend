const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZOHO_ID_RE = /^\d{6,25}$/;

export const DELIVERY_STATUSES = ['unknown', 'delivered', 'bounced', 'opened', 'clicked', 'failed'];
const CONFIRMED_STATUSES = ['delivered', 'opened', 'clicked'];
export const MAX_BULK_ENTRIES = 100; // express.json() limite le corps a 100 ko par defaut

const pick = (raw, camel, snake) => raw[camel] ?? raw[snake];
const optString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

/**
 * Valide et normalise une entree du journal (accepte camelCase ou snake_case).
 * Retourne { ok: true, value } ou { ok: false, error }.
 */
export function normalizeEmailLogEntry(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Entry must be an object' };
  }

  const zohoDealId = String(pick(raw, 'zohoDealId', 'zoho_deal_id') ?? '').trim();
  if (!ZOHO_ID_RE.test(zohoDealId)) {
    return { ok: false, error: 'zohoDealId must be a numeric Zoho id' };
  }

  const zohoContactId = optString(pick(raw, 'zohoContactId', 'zoho_contact_id'));
  if (zohoContactId && !ZOHO_ID_RE.test(zohoContactId)) {
    return { ok: false, error: 'zohoContactId must be a numeric Zoho id' };
  }

  const email = String(raw.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'email is invalid' };
  }

  const deliveryStatus = optString(pick(raw, 'deliveryStatus', 'delivery_status')) ?? 'unknown';
  if (!DELIVERY_STATUSES.includes(deliveryStatus)) {
    return { ok: false, error: `deliveryStatus must be one of: ${DELIVERY_STATUSES.join(', ')}` };
  }

  let batch = null;
  if (raw.batch !== undefined && raw.batch !== null && raw.batch !== '') {
    batch = Number(raw.batch);
    if (!Number.isInteger(batch) || batch < 0) {
      return { ok: false, error: 'batch must be a non-negative integer' };
    }
  }

  const zohoUpdateStatus = optString(pick(raw, 'zohoUpdateStatus', 'zoho_update_status')) ?? 'SUCCESS';
  if (!['SUCCESS', 'FAILED'].includes(zohoUpdateStatus)) {
    return { ok: false, error: 'zohoUpdateStatus must be SUCCESS or FAILED' };
  }

  let sentAt = null;
  const sentAtRaw = pick(raw, 'sentAt', 'sent_at');
  if (sentAtRaw) {
    sentAt = new Date(sentAtRaw);
    if (Number.isNaN(sentAt.getTime())) {
      return { ok: false, error: 'sentAt is not a valid date' };
    }
  }

  const campaign = optString(raw.campaign) ?? optString(defaults.campaign) ?? 'reps_activation';

  return {
    ok: true,
    value: {
      campaign,
      zohoDealId,
      zohoContactId,
      email,
      pipeline: optString(raw.pipeline),
      stage: optString(raw.stage),
      action: optString(raw.action),
      batch,
      zohoUpdateStatus,
      verifiedBy: optString(pick(raw, 'verifiedBy', 'verified_by')),
      deliveryStatus,
      deliveryConfirmed: CONFIRMED_STATUSES.includes(deliveryStatus),
      source: optString(raw.source),
      sentAt,
    },
  };
}
