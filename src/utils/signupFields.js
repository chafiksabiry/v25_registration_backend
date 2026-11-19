/**
 * Liste blanche des champs qu'un formulaire d'inscription (POST /auth/register) peut fournir.
 *
 * Source : v25_registration_front, src/lib/api.ts (auth.register) appelé par src/components/RegistrationDialog.tsx —
 * nom complet, e-mail, mot de passe, téléphone facultatif ; en production s'y ajoutent les champs de mesure Meta
 * (retirés par le contrôleur, jamais écrits dans le compte) et l'origine utm_ (`attribution`).
 *
 * Tout le reste est fixé par le serveur seulement : isVerified, typeUser, product, verificationCode, employerCompanyId,
 * employments, linkedInId, invitation*, mustChangePassword, firstTime, source/importBatch, reengagement, inviteLogin,
 * pendingChanges, ipHistory, createdAt... Un corps qui les contient est accepté, mais ces clés sont ignorées.
 */
export const SIGNUP_FIELDS = Object.freeze(['fullName', 'email', 'password', 'phone', 'attribution']);

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asString = (value) => (typeof value === 'string' ? value : undefined);

/** Origine utm_ : seules les cinq clés standard à valeur texte ; `undefined` s'il n'en reste aucune. */
function pickAttribution(raw) {
  if (!isPlainObject(raw)) return undefined;
  const out = {};
  for (const key of UTM_KEYS) {
    if (typeof raw[key] === 'string' && raw[key].trim()) out[key] = raw[key].trim().slice(0, 100);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param {unknown} body corps de la requête d'inscription (ou données déjà nettoyées par le contrôleur)
 * @returns {{ fullName?: string, email?: string, password?: string, phone?: unknown, attribution?: Record<string,string> }}
 */
export function pickSignupFields(body) {
  const src = isPlainObject(body) ? body : {};
  const out = {};
  const fullName = asString(src.fullName);
  if (fullName !== undefined) out.fullName = fullName;
  const email = asString(src.email);
  if (email !== undefined) out.email = email;
  const password = asString(src.password);
  if (password !== undefined) out.password = password;
  // Le téléphone est validé ensuite par normalizeOptionalPhone (vide => non écrit).
  if (src.phone !== undefined) out.phone = src.phone;
  const attribution = pickAttribution(src.attribution);
  if (attribution) out.attribution = attribution;
  return out;
}
