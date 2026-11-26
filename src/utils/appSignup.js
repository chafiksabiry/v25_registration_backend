/**
 * Création de compte depuis l'application mobile HARX Nomad (iOS, hors vitrine App Store des États-Unis) et relances par e-mail.
 *
 * Règles (maquettes B et E validées par le fondateur, App Review Guidelines 3.1.3(f)) :
 *  - l'app n'envoie que prénom, e-mail, pays (ISO 3166-1 alpha-2), langue et l'accord de contact (case à cocher) ;
 *  - aucun prix ni paiement dans l'app : l'activation (numéro, abonnement, mot de passe) se fait sur le web, via le lien de l'e-mail ;
 *  - réponse identique que l'e-mail existe déjà ou non (on ne révèle jamais si une adresse a un compte) ;
 *  - relances (e-mails 2 et 3) seulement avec l'accord de contact, arrêtées dès que la ligne est active ou au désabonnement.
 *
 * Activation (choix documenté) : le compte est créé non vérifié, avec un mot de passe aléatoire jamais communiqué, `signup.offer`
 * NOMAD (adresse d'entrée « /app/ios ») et `appSignup.pending: true`. L'e-mail 1 mène à l'inscription NOMAD du site
 * (FRONTEND_URL/nomad/inscription?email=…&lang=…, ou NOMAD_ACTIVATION_URL). Le parcours web existant (POST /auth/check-email puis
 * /auth/register, code e-mail, numéro, paiement) reprend ce compte au lieu de répondre « e-mail déjà utilisé » (authService.register,
 * isClaimableAppSignup) : la personne y choisit son mot de passe, prouve sa boîte par le code, puis se connecte dans l'app avec
 * e-mail + mot de passe + code comme tout abonné. Rien d'autre n'est ajouté au flux de connexion.
 *
 * Ce fichier ne contient que des fonctions pures (validation, calendrier, jeton de désabonnement), testées sans base de données.
 */
import crypto from 'crypto';
import { isoCountry } from '../services/callCenterWorkspaceStateValidation.js';

/** Source enregistrée avec l'accord de contact. */
export const APP_SIGNUP_SOURCE = 'ios-app';
/** Adresse d'entrée du parcours (utils/signupJourney.js SIGNUP_ENTRIES) : impose l'offre NOMAD. */
export const APP_SIGNUP_ENTRY = '/app/ios';
export const APP_SIGNUP_LANGS = Object.freeze(['fr', 'en', 'es', 'ar']);
/** Nombre d'e-mails au plus (1 immédiat, 2 à J+1, 3 à J+3). */
export const RELANCE_MAX_STEP = 3;
/** Délais par défaut des e-mails 2 et 3 après la création du compte, en heures. */
export const DEFAULT_RELANCE_DELAYS_HOURS = Object.freeze([24, 72]);
/** Au-delà, un compte n'est plus relancé (filet de sécurité si le service a été arrêté longtemps). */
export const RELANCE_MAX_AGE_DAYS = 14;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIRST_NAME_MAX = 60;

export function normalizeEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/**
 * Validation du corps de POST /api/auth/app-signup. Les clés inconnues sont ignorées (liste blanche).
 * @returns {{ ok: true, value: { firstName: string, email: string, country: string, lang: string, consent: boolean } } | { ok: false, code: string, field: string }}
 */
export function validateAppSignup(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const firstName = typeof src.firstName === 'string' ? src.firstName.trim().replace(/\s+/g, ' ') : '';
  if (!firstName || firstName.length > FIRST_NAME_MAX || /[<>]/.test(firstName) || /[\u0000-\u001f]/.test(firstName)) {
    return { ok: false, code: 'INVALID_FIRST_NAME', field: 'firstName' };
  }
  const email = normalizeEmail(src.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, code: 'INVALID_EMAIL', field: 'email' };
  const country = isoCountry(src.country);
  if (!country) return { ok: false, code: 'INVALID_COUNTRY', field: 'country' };
  if (typeof src.consent !== 'boolean') return { ok: false, code: 'INVALID_CONSENT', field: 'consent' };
  const rawLang = typeof src.lang === 'string' ? src.lang.slice(0, 2).toLowerCase() : '';
  const lang = APP_SIGNUP_LANGS.includes(rawLang) ? rawLang : 'en';
  return { ok: true, value: { firstName, email, country, lang, consent: src.consent } };
}

/**
 * Bloc `appSignup` écrit sur le compte à la création. L'accord est enregistré tel qu'il a été donné (booléen), avec sa date et sa source.
 */
export function appSignupRecord({ consent, now = new Date() }) {
  return {
    source: APP_SIGNUP_SOURCE,
    at: now,
    pending: true,
    consent: consent === true,
    consentAt: now,
    consentSource: APP_SIGNUP_SOURCE,
    unsubscribedAt: null,
    relance: { step: 0, lastSentAt: null, stoppedAt: null, stopReason: null, lockUntil: null },
  };
}

/** Délais des e-mails 2 et 3 (heures) : NOMAD_RELANCE_DELAYS_HOURS="24,72" ; valeur absente ou invalide -> défaut. */
export function relanceDelaysHours(env = process.env) {
  const raw = String(env.NOMAD_RELANCE_DELAYS_HOURS || '').trim();
  if (!raw) return [...DEFAULT_RELANCE_DELAYS_HOURS];
  const parts = raw.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 24 * 30) || parts[1] < parts[0]) {
    return [...DEFAULT_RELANCE_DELAYS_HOURS];
  }
  return parts;
}

/** Mode simulation des relances : actif sauf si NOMAD_RELANCE_DRY_RUN vaut exactement « false » (recette : simulation par défaut). */
export function relanceDryRun(env = process.env) {
  return String(env.NOMAD_RELANCE_DRY_RUN ?? '').trim().toLowerCase() !== 'false';
}

const time = (v) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Décision de relance pour un compte (pure). `lineActive` : la ligne NOMAD est active (abonnement actif ou en essai).
 * @returns {{ action: 'send', step: number } | { action: 'wait', step: number, dueAt: Date } | { action: 'stop', reason: string } | { action: 'done' }}
 */
export function relanceDecision(user, { now = new Date(), lineActive = false, delaysHours = DEFAULT_RELANCE_DELAYS_HOURS } = {}) {
  const a = user?.appSignup;
  if (!a || a.source !== APP_SIGNUP_SOURCE) return { action: 'stop', reason: 'not_app_signup' };
  if (a.consent !== true) return { action: 'stop', reason: 'no_consent' };
  if (a.unsubscribedAt) return { action: 'stop', reason: 'unsubscribed' };
  if (user.disabled === true) return { action: 'stop', reason: 'disabled' };
  if (a.relance?.stoppedAt) return { action: 'stop', reason: a.relance.stopReason || 'stopped' };
  if (lineActive) return { action: 'stop', reason: 'line_active' };
  const step = Number(a.relance?.step) || 0;
  if (step >= RELANCE_MAX_STEP) return { action: 'done' };
  const created = time(a.at);
  if (created === null) return { action: 'stop', reason: 'no_date' };
  const nowMs = now.getTime();
  if (nowMs - created > RELANCE_MAX_AGE_DAYS * 24 * 3600 * 1000) return { action: 'stop', reason: 'too_old' };
  const next = step + 1;
  // E-mail 1 : tout de suite (envoyé à la création ; repris ici seulement si son envoi a échoué).
  const dueMs = next === 1 ? created : created + delaysHours[next - 2] * 3600 * 1000;
  if (nowMs < dueMs) return { action: 'wait', step: next, dueAt: new Date(dueMs) };
  return { action: 'send', step: next };
}

/** Lien d'activation : l'inscription NOMAD du site (mot de passe, numéro, abonnement), e-mail et langue en paramètres. */
export function activationUrl({ email, lang }, env = process.env) {
  const explicit = String(env.NOMAD_ACTIVATION_URL || '').trim();
  const base = explicit
    ? explicit.replace(/\/+$/, '')
    : `${String(env.FRONTEND_URL || 'https://harx.ai').trim().replace(/\/+$/, '').replace(/\/auth$/, '')}/nomad/inscription`;
  const q = new URLSearchParams({ email, ...(APP_SIGNUP_LANGS.includes(lang) ? { lang } : {}), utm_source: 'nomad-app', utm_medium: 'email' });
  return `${base}?${q.toString()}`;
}

function unsubscribeSecret(env) {
  const s = env.NOMAD_UNSUBSCRIBE_SECRET || env.JWT_SECRET;
  if (!s) throw new Error('No secret for unsubscribe links');
  return `nomad-unsubscribe:${s}`;
}

/** Jeton de désabonnement sans état : identifiant du compte + HMAC-SHA256 (aucune date d'expiration : le lien reste valable). */
export function unsubscribeToken(userId, env = process.env) {
  const id = String(userId);
  const mac = crypto.createHmac('sha256', unsubscribeSecret(env)).update(id).digest('base64url');
  return `${id}.${mac}`;
}

/** Identifiant du compte si le jeton est authentique, sinon null. */
export function verifyUnsubscribeToken(token, env = process.env) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [id, mac] = token.split('.');
  if (!id || !mac || !/^[a-f0-9]{24}$/i.test(id)) return null;
  const expected = unsubscribeToken(id, env).split('.')[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

/** Adresse publique de ce service (liens de désabonnement). */
export function publicApiBase(env = process.env) {
  const railway = String(env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const fromRailway = railway ? (/^https?:\/\//i.test(railway) ? railway : `https://${railway}`) : '';
  // Railway fournit RAILWAY_PUBLIC_DOMAIN pour chaque environnement : en recette, les liens visent bien le service de recette.
  return String(env.PUBLIC_API_URL || env.REGISTRATION_PUBLIC_URL || fromRailway || 'https://v25registrationbackend-production.up.railway.app').trim().replace(/\/+$/, '');
}

export function unsubscribeUrl(userId, env = process.env) {
  return `${publicApiBase(env)}/api/auth/app-signup/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, env))}`;
}

/**
 * Compte créé dans l'app et pas encore activé : l'inscription web NOMAD (POST /auth/register, même e-mail) peut le reprendre
 * (mot de passe, nom) au lieu de répondre « e-mail déjà utilisé ». La propriété de la boîte est prouvée ensuite par le code e-mail,
 * comme pour toute inscription. Un compte vérifié, désactivé ou d'une autre origine n'est jamais repris.
 */
export function isClaimableAppSignup(user) {
  return Boolean(user && user.appSignup && user.appSignup.source === APP_SIGNUP_SOURCE && user.appSignup.pending === true
    && user.isVerified !== true && user.disabled !== true);
}
