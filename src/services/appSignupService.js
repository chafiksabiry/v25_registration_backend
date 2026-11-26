import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { getClientIp } from '../utils/ipHelper.js';
import { pickSignup } from '../utils/signupJourney.js';
import { ENTITLED_STATUSES } from './companyProduct.js';
import { sendAppEmail } from './brevoMail.js';
import { nomadAppEmail } from '../utils/nomadAppMessages.js';
import {
  APP_SIGNUP_ENTRY,
  APP_SIGNUP_SOURCE,
  RELANCE_MAX_AGE_DAYS,
  RELANCE_MAX_STEP,
  activationUrl,
  appSignupRecord,
  relanceDecision,
  relanceDelaysHours,
  relanceDryRun,
  unsubscribeUrl,
  validateAppSignup,
  verifyUnsubscribeToken,
} from '../utils/appSignup.js';

/**
 * Création de compte depuis l'app (POST /api/auth/app-signup), désabonnement et relances (voir utils/appSignup.js pour les règles).
 * Les accès à la base et l'envoi d'e-mails sont injectables (tests sans base ni envoi réel).
 */

/** Réponse unique, que le compte vienne d'être créé ou que l'e-mail existe déjà (on ne révèle jamais l'existence d'un compte). */
export const APP_SIGNUP_RESPONSE = Object.freeze({ success: true, code: 'APP_SIGNUP_ACCEPTED' });
const LOCK_MS = 10 * 60 * 1000;
const BATCH = 200;
const oidOrString = (v) => (mongoose.Types.ObjectId.isValid(String(v)) ? [new mongoose.Types.ObjectId(String(v)), String(v)] : [String(v)]);

export class AppSignupError extends Error {
  constructor(status, code, field = null) {
    super(code);
    this.statusCode = status;
    this.code = code;
    this.field = field;
  }
}

/** E-mail n° `step` d'un compte créé dans l'app, avec l'en-tête de désabonnement en un clic quand l'accord est donné. */
export function buildAppEmail(user, step, env = process.env) {
  const consent = user?.appSignup?.consent === true;
  const unsub = consent ? unsubscribeUrl(user._id, env) : null;
  const message = nomadAppEmail({
    step,
    lang: user?.signup?.lang,
    country: user?.signup?.country,
    firstName: user?.fullName,
    activationUrl: activationUrl({ email: user.email, lang: user?.signup?.lang }, env),
    unsubscribeUrl: unsub,
    consent,
  });
  const headers = unsub ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  return { to: user.email, subject: message.subject, text: message.text, html: message.html, ...(headers ? { headers } : {}) };
}

const defaultDeps = () => ({
  now: () => new Date(),
  env: process.env,
  log: (...args) => console.log(...args),
  findUserByEmail: (email) => User.findOne({ email }).lean(),
  findUserById: (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? User.findById(id).lean() : null),
  createUser: async (doc) => (await new User(doc).save()).toObject(),
  updateUser: (filter, update) => User.collection.updateOne(filter, update),
  sendEmail: (mail) => sendAppEmail(mail),
  /** Comptes à examiner par la tâche de relance (accord donné, pas désabonnés, relances en cours, récents). */
  findRelanceCandidates: (now) => User.find({
    'appSignup.source': APP_SIGNUP_SOURCE,
    'appSignup.consent': true,
    'appSignup.unsubscribedAt': null,
    'appSignup.relance.stoppedAt': null,
    'appSignup.relance.step': { $lt: RELANCE_MAX_STEP },
    'appSignup.at': { $gte: new Date(now.getTime() - RELANCE_MAX_AGE_DAYS * 24 * 3600 * 1000 - 24 * 3600 * 1000) },
  }).limit(BATCH).lean(),
  /** Ligne active : une société du compte a un abonnement actif ou en essai (même statuts que companyProduct.js). */
  lineActive: async (userId) => {
    const db = mongoose.connection.db;
    const companies = await db.collection('companies').find({ userId: { $in: oidOrString(userId) } }).project({ _id: 1 }).toArray();
    if (!companies.length) return false;
    const keys = companies.flatMap((c) => oidOrString(c._id));
    const sub = await db.collection('subscriptions').findOne({ companyId: { $in: keys }, status: { $in: ENTITLED_STATUSES } }, { projection: { _id: 1 } });
    return Boolean(sub);
  },
});

export function createAppSignupService(overrides = {}) {
  const d = { ...defaultDeps(), ...overrides };

  /** Envoie l'e-mail 1 (activation) juste après la création ; un échec laisse step = 0 : la tâche de relance le reprendra. */
  async function sendFirstEmail(user) {
    try {
      await d.sendEmail(buildAppEmail(user, 1, d.env));
      await d.updateUser({ _id: user._id, 'appSignup.relance.step': 0 }, { $set: { 'appSignup.relance.step': 1, 'appSignup.relance.lastSentAt': d.now() } });
      return true;
    } catch (err) {
      d.log(`[app-signup] e-mail d'activation non envoyé (compte ${String(user._id)}) : ${err?.message || err}`);
      return false;
    }
  }

  return {
    /**
     * @returns {Promise<{ response: object, created: boolean, background: Promise<unknown> }>} `background` : envoi de l'e-mail 1,
     * jamais attendu par la requête (même durée de réponse que le compte existe ou non).
     */
    async signup(body, req) {
      const v = validateAppSignup(body);
      if (!v.ok) throw new AppSignupError(400, v.code, v.field);
      const { firstName, email, country, lang, consent } = v.value;
      const existing = await d.findUserByEmail(email);
      if (existing) return { response: APP_SIGNUP_RESPONSE, created: false, background: Promise.resolve(null) };
      const now = d.now();
      let user;
      try {
        user = await d.createUser({
          fullName: firstName,
          email,
          // Mot de passe aléatoire jamais communiqué : la personne choisit le sien à l'activation sur le web (POST /auth/register).
          password: crypto.randomBytes(32).toString('hex'),
          signup: pickSignup({ entry: APP_SIGNUP_ENTRY, lang, country }, { now }),
          journey: { account_created: now },
          isVerified: false,
          appSignup: appSignupRecord({ consent, now }),
          ipHistory: [{ ip: req ? getClientIp(req) : null, action: 'register' }],
        });
      } catch (err) {
        // Deux demandes simultanées pour le même e-mail : l'index unique refuse la seconde ; même réponse.
        if (err?.code === 11000) return { response: APP_SIGNUP_RESPONSE, created: false, background: Promise.resolve(null) };
        throw err;
      }
      return { response: APP_SIGNUP_RESPONSE, created: true, background: sendFirstEmail(user) };
    },

    /** Désabonnement en un clic : true si le jeton est authentique (le compte peut ne plus exister). Idempotent. */
    async unsubscribe(token) {
      const id = verifyUnsubscribeToken(token, d.env);
      if (!id) return false;
      const at = d.now();
      await d.updateUser(
        { _id: new mongoose.Types.ObjectId(id), 'appSignup.source': APP_SIGNUP_SOURCE, 'appSignup.unsubscribedAt': null },
        { $set: { 'appSignup.unsubscribedAt': at, 'appSignup.relance.stoppedAt': at, 'appSignup.relance.stopReason': 'unsubscribed' } },
      );
      return true;
    },

    /** Un passage de la tâche de relance. Idempotent : chaque e-mail est réservé (verrou + étape attendue) avant l'envoi. */
    async runRelances() {
      const now = d.now();
      const dryRun = relanceDryRun(d.env);
      const delaysHours = relanceDelaysHours(d.env);
      const out = { examined: 0, sent: 0, simulated: 0, stopped: 0, failed: 0, dryRun };
      const users = (await d.findRelanceCandidates(now)) || [];
      for (const user of users) {
        out.examined++;
        let lineActive = false;
        try { lineActive = await d.lineActive(user._id); } catch (err) {
          d.log(`[relance] ligne non lue (compte ${String(user._id)}) : ${err?.message || err}`);
          continue; // sans certitude, on n'écrit pas : nouvel essai au prochain passage
        }
        const decision = relanceDecision(user, { now, lineActive, delaysHours });
        if (decision.action === 'stop') {
          await d.updateUser({ _id: user._id, 'appSignup.relance.stoppedAt': null }, { $set: { 'appSignup.relance.stoppedAt': now, 'appSignup.relance.stopReason': decision.reason } });
          out.stopped++;
          continue;
        }
        if (decision.action !== 'send') continue;
        const step = decision.step;
        if (dryRun) {
          if ((Number(user.appSignup?.relance?.dryRunStep) || 0) < step) {
            d.log(`[relance] simulation : e-mail ${step} pour le compte ${String(user._id)} (NOMAD_RELANCE_DRY_RUN)`);
            await d.updateUser({ _id: user._id }, { $set: { 'appSignup.relance.dryRunStep': step } });
            out.simulated++;
          }
          continue;
        }
        const claim = await d.updateUser(
          { _id: user._id, 'appSignup.relance.step': step - 1, $or: [{ 'appSignup.relance.lockUntil': null }, { 'appSignup.relance.lockUntil': { $lt: now } }] },
          { $set: { 'appSignup.relance.lockUntil': new Date(now.getTime() + LOCK_MS) } },
        );
        if (!claim || claim.modifiedCount !== 1) continue; // déjà pris par un autre passage
        try {
          await d.sendEmail(buildAppEmail(user, step, d.env));
          await d.updateUser({ _id: user._id }, { $set: { 'appSignup.relance.step': step, 'appSignup.relance.lastSentAt': now, 'appSignup.relance.lockUntil': null } });
          out.sent++;
        } catch (err) {
          await d.updateUser({ _id: user._id }, { $set: { 'appSignup.relance.lockUntil': null } });
          d.log(`[relance] e-mail ${step} non envoyé (compte ${String(user._id)}) : ${err?.message || err}`);
          out.failed++;
        }
      }
      return out;
    },
  };
}

export const appSignupService = createAppSignupService();
