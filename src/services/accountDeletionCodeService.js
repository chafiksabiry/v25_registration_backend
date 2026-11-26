import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { sendAppEmail } from './brevoMail.js';
import { accountClosureService, AccountClosureError } from './accountClosureService.js';
import { accountDeletionCodeEmail } from '../utils/nomadAppMessages.js';
import { normalizeEmail } from '../utils/appSignup.js';

/**
 * Suppression du compte confirmée par un code e-mail (App Review Guideline 5.1.1(v)) : utilisable connecté ou non, y compris pour un
 * compte créé dans l'app qui n'a pas encore de mot de passe connu. Deux étapes :
 *  1. POST /api/auth/account-deletion/request { email, lang } : réponse identique que le compte existe ou non ; s'il existe, un code à
 *     6 chiffres est envoyé (empreinte HMAC seulement en base, 10 minutes, au plus un envoi par minute) ;
 *  2. POST /api/auth/account-deletion/confirm { email, code } : code vérifié (5 essais au plus, usage unique), puis suppression par le
 *     service existant (accountClosureService.deleteAccount), qui applique les mêmes refus (société avec d'autres membres, comptes protégés).
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const DELETION_REQUEST_RESPONSE = Object.freeze({ success: true, code: 'DELETION_CODE_REQUESTED' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class DeletionCodeError extends Error {
  constructor(status, code) {
    super(code);
    this.statusCode = status;
    this.code = code;
  }
}

function secret(env) {
  const s = env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET missing');
  return `account-deletion-code:${s}`;
}

/** Empreinte du code liée au compte (un code ne vaut que pour ce compte). */
export function codeHash(userId, code, env = process.env) {
  return crypto.createHmac('sha256', secret(env)).update(`${String(userId)}:${String(code)}`).digest('hex');
}

const sameHash = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const defaultDeps = () => ({
  now: () => new Date(),
  env: process.env,
  log: (...a) => console.warn(...a),
  randomCode: () => String(crypto.randomInt(100000, 1000000)),
  findUserByEmail: (email) => User.findOne({ email }).lean(),
  updateUser: (filter, update) => User.collection.updateOne(filter, update),
  sendEmail: (mail) => sendAppEmail(mail),
  deleteAccount: (args) => accountClosureService.deleteAccount(args),
});

export function createAccountDeletionCodeService(overrides = {}) {
  const d = { ...defaultDeps(), ...overrides };
  const oid = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);
  const clear = (user) => d.updateUser({ _id: oid(user._id) }, { $set: { accountDeletionCode: { hash: null, expiresAt: null, attempts: 0, requestedAt: null } } });

  return {
    /** @returns {Promise<{ response: object, sent: boolean }>} `sent` pour les tests seulement : jamais renvoyé au client. */
    async request(body) {
      const email = normalizeEmail(body?.email);
      if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new DeletionCodeError(400, 'INVALID_EMAIL');
      const lang = typeof body?.lang === 'string' ? body.lang.slice(0, 2).toLowerCase() : 'en';
      const user = await d.findUserByEmail(email);
      if (!user || user.disabled === true) return { response: DELETION_REQUEST_RESPONSE, sent: false };
      const now = d.now();
      const last = user.accountDeletionCode?.requestedAt ? new Date(user.accountDeletionCode.requestedAt).getTime() : 0;
      if (now.getTime() - last < RESEND_COOLDOWN_MS) return { response: DELETION_REQUEST_RESPONSE, sent: false };
      const code = d.randomCode();
      await d.updateUser({ _id: oid(user._id) }, {
        $set: { accountDeletionCode: { hash: codeHash(user._id, code, d.env), expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, requestedAt: now } },
      });
      try {
        const m = accountDeletionCodeEmail({ code, lang });
        await d.sendEmail({ to: user.email, subject: m.subject, text: m.text, html: m.html });
      } catch (err) {
        d.log(`[account-deletion] code non envoyé (compte ${String(user._id)}) : ${err?.message || err}`);
      }
      return { response: DELETION_REQUEST_RESPONSE, sent: true };
    },

    /** Vérifie le code (usage unique) puis supprime le compte par le service existant. */
    async confirm(body) {
      const email = normalizeEmail(body?.email);
      const code = String(body?.code ?? '').replace(/\s/g, '');
      if (!email || !/^\d{6}$/.test(code)) throw new DeletionCodeError(400, 'INVALID_CODE');
      const user = await d.findUserByEmail(email);
      const c = user?.accountDeletionCode;
      // Même erreur que le compte existe ou non, que le code soit faux, expiré ou épuisé.
      if (!user || !c?.hash || !c.expiresAt || new Date(c.expiresAt).getTime() < d.now().getTime() || (Number(c.attempts) || 0) >= MAX_ATTEMPTS) {
        if (user && c?.hash) await clear(user);
        throw new DeletionCodeError(400, 'INVALID_CODE');
      }
      if (!sameHash(codeHash(user._id, code, d.env), c.hash)) {
        const attempts = (Number(c.attempts) || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) await clear(user);
        else await d.updateUser({ _id: oid(user._id) }, { $set: { 'accountDeletionCode.attempts': attempts } });
        throw new DeletionCodeError(400, 'INVALID_CODE');
      }
      // Usage unique : le code est effacé AVANT la suppression (un refus, ex. société avec d'autres membres, demande un nouveau code).
      await clear(user);
      return d.deleteAccount({ userId: String(user._id), actor: { type: 'self-email-code', verified: true }, email: user.email, product: 'nomad' });
    },
  };
}

export const accountDeletionCodeService = createAccountDeletionCodeService();
export { AccountClosureError };
