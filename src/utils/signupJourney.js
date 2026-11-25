/**
 * Parcours d'inscription d'un compte (demande du fondateur, 25/11/2026 : « il faut suivre surtout les parcours d'inscription et les
 * noter »). Deux parties, écrites sur le compte (`users`) :
 *
 * 1. `signup` : l'offre et le produit du parcours d'entrée, posés UNE fois à la création du compte (POST /auth/register). Le site
 *    harx.ai les envoie d'après l'adresse où la personne s'inscrit (/nomad/inscription, /cloud/receptionist/inscription/compte,
 *    ancienne /auth/register-call-center…) ; le serveur ne garde que des valeurs de listes fermées (jamais de texte libre) et
 *    l'adresse d'entrée impose son offre quand elle en a une (une adresse NOMAD ne peut pas enregistrer CLOUD).
 *    `signup.offer`, quand il est connu, fait foi pour l'offre du compte (services/accountOffer.js), règle des membres gardée.
 *
 * 2. `journey` : étapes datées du parcours, chacune posée la PREMIÈRE fois seulement (mise à jour conditionnelle `$exists: false` :
 *    rejouer un événement ne change jamais la date). Une étape n'est posée que sur un compte dont le parcours est enregistré
 *    (`journey.account_created`, posé à la création) : les comptes antérieurs restent « Parcours non enregistré » (pas de rattrapage).
 *    Mêmes noms d'étapes dans v25_comporchestrator_back (src/services/signupJourney.js), qui pose identité, appel d'essai, numéro et
 *    paiement dans la même collection partagée.
 *
 * Aucune donnée personnelle en plus de ce que le compte porte déjà : des dates, des valeurs de listes fermées, l'adresse d'entrée
 * (chemin connu, sans paramètres) et le pays de connexion déjà présent dans `ipHistory`.
 */
import { isoCountry } from '../services/callCenterWorkspaceStateValidation.js';

export const SIGNUP_OFFERS = Object.freeze(['nomad', 'cloud', 'taas']);
export const SIGNUP_PRODUCTS = Object.freeze(['receptionist', 'entreprise', 'contact_centre']);
/** Langues du site harx.ai (v25_registration_front, src/lib/i18n.ts `supportedLngs`). */
export const SIGNUP_LANGS = Object.freeze(['en', 'fr', 'es', 'ar']);

/**
 * Adresses d'inscription connues (sans préfixe de langue, sans paramètres) et l'offre / le produit qu'elles imposent.
 * `offers` : offres permises quand l'adresse ne décide pas seule (anciennes adresses partagées).
 */
export const SIGNUP_ENTRIES = Object.freeze({
  '/nomad/inscription': { offer: 'nomad', product: null },
  '/auth/register-nomad': { offer: 'nomad', product: null },
  '/cloud/receptionist/inscription': { offer: 'cloud', product: 'receptionist' },
  '/cloud/receptionist/inscription/compte': { offer: 'cloud', product: 'receptionist' },
  '/auth/register-company': { offer: 'taas', product: null },
  // Ancienne inscription Téléphonie : CLOUD (Receptionist / Entreprise / Contact Centre) ou NOMAD selon le parcours en cours.
  '/auth/register-call-center': { offers: ['nomad', 'cloud'] },
  '/auth/register': { offers: SIGNUP_OFFERS },
  // Inscription d'un agent : aucune offre.
  '/auth/register-rep': { offers: [] },
});

/** Étapes du parcours, dans l'ordre affiché par l'administration. */
export const JOURNEY_MILESTONES = Object.freeze([
  'account_created',
  'email_verified',
  'phone_verified',
  'identity_submitted',
  'identity_verified',
  'offer_chosen',
  'trial_call',
  'number_chosen',
  'payment_succeeded',
  'onboarding_finished',
  'first_login_app',
]);
/** Issue de l'appel d'essai NOMAD : passé, sauté (paiement sans essai), essai déjà utilisé. */
export const TRIAL_CALL_OUTCOMES = Object.freeze(['done', 'skipped', 'used']);

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Chemin d'entrée normalisé (sans préfixe de langue ni « / » final) s'il est dans la liste ; null sinon. */
export function normalizeEntry(raw) {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let p = raw.trim().split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const m = p.match(/^\/([a-z]{2})(\/.*)$/);
  if (m && SIGNUP_LANGS.includes(m[1])) p = m[2];
  return Object.prototype.hasOwnProperty.call(SIGNUP_ENTRIES, p) ? p : null;
}

/**
 * `signup` à écrire à la création du compte, ou undefined si le corps n'en porte pas (ancien site : rien n'est inventé).
 * @param {unknown} raw `body.signup`
 * @param {{ now?: Date, ipCountry?: string|null }} [opts] pays de connexion (lookup IP déjà fait par register) si le site n'en envoie pas
 */
export function pickSignup(raw, { now = new Date(), ipCountry = null } = {}) {
  if (!isPlainObject(raw)) return undefined;
  const entry = normalizeEntry(raw.entry);
  const rule = entry ? SIGNUP_ENTRIES[entry] : null;
  let offer = SIGNUP_OFFERS.includes(raw.offer) ? raw.offer : null;
  let product = SIGNUP_PRODUCTS.includes(raw.product) ? raw.product : null;
  if (rule && rule.offer) {
    // L'adresse décide : NOMAD sur une adresse NOMAD, CLOUD Receptionist sur une adresse Receptionist, quoi que dise le corps.
    offer = rule.offer;
    product = rule.product;
  } else if (rule && !rule.offers.includes(offer)) {
    offer = null;
  }
  if (offer !== 'cloud') product = null;
  const lang = typeof raw.lang === 'string' && SIGNUP_LANGS.includes(raw.lang.slice(0, 2).toLowerCase()) ? raw.lang.slice(0, 2).toLowerCase() : null;
  const country = isoCountry(raw.country) || isoCountry(ipCountry) || null;
  return { offer, product, entry, lang, country, at: now };
}

/**
 * Mise à jour conditionnelle d'une étape (première fois seulement, compte au parcours enregistré). Pure : utilisée telle quelle
 * par le service et par les tests.
 * @returns {{ filter: object, update: object } | null} null si l'étape ou l'issue est inconnue
 */
export function journeyStampUpdate(userId, milestone, { at = new Date(), outcome = null } = {}) {
  if (!JOURNEY_MILESTONES.includes(milestone) || milestone === 'account_created') return null;
  if (milestone === 'trial_call' && !TRIAL_CALL_OUTCOMES.includes(outcome)) return null;
  const set = { [`journey.${milestone}`]: at };
  if (milestone === 'trial_call') set['journey.trial_call_outcome'] = outcome;
  return {
    filter: { _id: userId, 'journey.account_created': { $exists: true }, [`journey.${milestone}`]: { $exists: false } },
    update: { $set: set },
  };
}

const time = (v) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Résumé pour l'administration : étapes atteintes ou non (dans l'ordre), dernière étape atteinte, terminé ou non, durée totale
 * (création -> fin de la mise en route). `recorded: false` : compte antérieur au suivi (aucun parcours enregistré).
 */
export function summarizeJourney(user) {
  const signup = isPlainObject(user?.signup) ? user.signup : null;
  const journey = isPlainObject(user?.journey) ? user.journey : {};
  const recorded = Boolean(signup || time(journey.account_created));
  const steps = JOURNEY_MILESTONES.map((id) => {
    const at = time(journey[id]);
    return {
      id,
      reached: at !== null,
      at: at !== null ? new Date(at).toISOString() : null,
      ...(id === 'trial_call' && TRIAL_CALL_OUTCOMES.includes(journey.trial_call_outcome) ? { outcome: journey.trial_call_outcome } : {}),
    };
  });
  const reached = steps.filter((s) => s.reached).sort((a, b) => time(a.at) - time(b.at));
  const last = reached.length ? reached[reached.length - 1].id : null;
  const start = time(journey.account_created);
  const end = time(journey.onboarding_finished);
  const finished = end !== null;
  return {
    recorded,
    signup: signup
      ? {
          offer: signup.offer || null,
          product: signup.product || null,
          entry: signup.entry || null,
          lang: signup.lang || null,
          country: signup.country || null,
          at: time(signup.at) !== null ? new Date(time(signup.at)).toISOString() : null,
        }
      : null,
    steps,
    lastReached: last,
    finished,
    totalMs: finished && start !== null ? Math.max(0, end - start) : null,
    status: !recorded ? 'unrecorded' : finished ? 'finished' : 'in_progress',
  };
}

/** Filtre « parcours » de la liste admin : terminé, bloqué à une étape (dernière atteinte), ou non enregistré. */
export function matchesJourneyFilter(summary, filter) {
  if (!filter) return true;
  if (filter === 'finished') return summary.status === 'finished';
  if (filter === 'unrecorded') return summary.status === 'unrecorded';
  if (filter.startsWith('stuck:')) return summary.status === 'in_progress' && summary.lastReached === filter.slice(6);
  return true;
}

export const JOURNEY_FILTERS = Object.freeze(['finished', 'unrecorded', ...JOURNEY_MILESTONES.map((m) => `stuck:${m}`)]);
