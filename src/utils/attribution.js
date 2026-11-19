/**
 * Origine d'une inscription (paramètres utm_ du lien de campagne) transmise par le front d'inscription, avec le consentement
 * « mesure d'audience » de la personne. Seuls les cinq paramètres standard sont gardés ; chaque valeur est bornée et filtrée
 * (lettres, chiffres et - _ . ~ + espace). Tout le reste est ignoré : rien d'autre ne passe dans le compte.
 */
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const SAFE = /^[A-Za-z0-9_\-.~+ ]{1,100}$/;

/** @returns {Record<string,string> | null} les paramètres valides, ou null s'il n'y en a aucun. */
export function sanitizeAttribution(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of UTM_KEYS) {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : '';
    if (value && SAFE.test(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}
