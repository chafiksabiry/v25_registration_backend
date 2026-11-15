import { suspiciousEmailReason } from '../utils/emailQuality.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PLACEHOLDER_NAMES = new Set(['none', 'n/a', 'na', 'null', 'undefined', '-', '--', 'unknown']);

const pick = (body, ...keys) => {
  for (const k of keys) {
    const v = body?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};
const cleanName = (v) => (PLACEHOLDER_NAMES.has(String(v).trim().toLowerCase()) ? '' : String(v).trim());

/** Accepte JSON ou formulaire, avec les noms de champs usuels de Zoho. N'invente aucune donnée. */
export function normalizePayload(body = {}) {
  const email = pick(body, 'email', 'Email', 'contact_email').toLowerCase();
  const first = cleanName(pick(body, 'firstName', 'first_name', 'First_Name'));
  const last = cleanName(pick(body, 'lastName', 'last_name', 'Last_Name'));
  let fullName = cleanName(pick(body, 'fullName', 'full_name', 'name')) || [first, last].filter(Boolean).join(' ');
  // Le schéma exige un fullName : à défaut, la partie locale de l'adresse (jamais un nom inventé).
  if (!fullName && email.includes('@')) fullName = email.split('@')[0];
  const phone = pick(body, 'phone', 'Phone', 'mobile', 'Mobile') || null;
  return { email, fullName, phone };
}

/** Même convention que scripts/importV1Reps.js : compte sans mot de passe, non vérifié, parcours d'accueil à faire. */
export function buildUserDoc(p, { newUserType, now, batchPrefix }) {
  return {
    fullName: p.fullName,
    phone: p.phone,
    password: null,
    typeUser: newUserType,
    isVerified: false,
    firstTime: true,
    invitationStatus: 'none',
    source: 'zoho_crm_sync',
    importBatch: `${batchPrefix}-${now.toISOString().slice(0, 7)}`,
    createdAt: now,
  };
}

/**
 * POST /api/integrations/zoho/sync-user
 * Ajoute l'utilisateur s'il n'existe pas ; s'il existe déjà, ne modifie RIEN. Upsert atomique sur l'e-mail
 * (index unique) : aucun doublon possible, même avec des appels simultanés ou répétés.
 */
export function createSyncUserHandler(opts = {}) {
  const getCollection = opts.getCollection || (async () => (await import('../models/User.js')).default.collection);
  const newUserType = opts.newUserType ?? (process.env.ZOHO_NEW_USER_TYPE || 'rep');
  const batchPrefix = opts.batchPrefix ?? (process.env.ZOHO_SYNC_BATCH_PREFIX || 'zoho-webhook');
  const nowFn = opts.now || (() => new Date());

  return async (req, res, next) => {
    try {
      const p = normalizePayload(req.body);
      if (!p.email || !EMAIL_RE.test(p.email)) {
        return res.status(400).json({ ok: false, error: 'valid_email_required' });
      }
      const bad = suspiciousEmailReason(p.email);
      if (bad) return res.status(200).json({ ok: true, status: 'skipped', reason: bad.split(':')[0] });

      const doc = buildUserDoc(p, { newUserType, now: nowFn(), batchPrefix });
      const users = await getCollection();
      try {
        // L'e-mail vient du filtre d'égalité : $setOnInsert n'écrase jamais un utilisateur existant.
        const r = await users.updateOne({ email: p.email }, { $setOnInsert: doc }, { upsert: true });
        return res.status(200).json({ ok: true, status: r.upsertedCount === 1 ? 'created' : 'exists' });
      } catch (err) {
        if (err && err.code === 11000) return res.status(200).json({ ok: true, status: 'exists' });
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  };
}
