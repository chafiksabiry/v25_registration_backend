/** Coordonnées modifiables du profil de l'entreprise : e-mail, téléphone, adresse (pure, testable sans base). */

const str = (v) => String(v ?? '').trim();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Champs réglementaires (KYB) : jamais modifiables par cette route. */
export const LOCKED_FIELDS = ['name', 'siren', 'country', 'documents', 'kybStatus'];
export const EDITABLE_FIELDS = ['representativeEmail', 'phone', 'address'];

export function normalizeEmail(raw) {
  const v = str(raw).toLowerCase();
  return v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

/** Numéro international uniquement (E.164, 8 à 15 chiffres) ; « 00 » accepté pour « + ». Le serveur ne devine jamais l'indicatif. */
export function normalizePhone(raw) {
  let s = str(raw).replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

const POSTAL = {
  FR: (v) => /^\d{5}$/.test(v),
  GB: (v) => /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(v.toUpperCase()),
  US: (v) => /^\d{5}(-\d{4})?$/.test(v),
};
const postalOk = (country, v) => (POSTAL[country] ? POSTAL[country](v) : /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/.test(v));
const isPoBox = (street) => /^\s*(b\.?\s?p\.?|boite\s+postale|boîte\s+postale|po\s?box|p\.o\.\s?box)\b/i.test(street);

/**
 * @param {object} body  { representativeEmail?, phone?, address?: { street, postalCode, city } } ; au moins un champ.
 * @param {string} country code pays du profil (inchangé) ; FR par défaut sur les anciens enregistrements.
 * @returns {{ value: { representativeEmail?: string, phone?: string, address?: object }, errors: string[] }}
 */
export function normalizeContactInput(body, country = 'FR') {
  const errors = [];
  const value = {};
  if (!isObj(body)) return { value, errors: ['Corps de requête invalide.'] };
  const locked = LOCKED_FIELDS.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (locked.length) errors.push(`Champs non modifiables : ${locked.join(', ')}. Contactez le support.`);
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!EDITABLE_FIELDS.some(has)) errors.push('Aucune modification fournie.');

  if (has('representativeEmail')) {
    const e = normalizeEmail(body.representativeEmail);
    if (!e) errors.push('Adresse e-mail invalide.');
    else value.representativeEmail = e;
  }
  if (has('phone')) {
    const p = normalizePhone(body.phone);
    if (!p) errors.push('Numéro de téléphone invalide : utilisez le format international (E.164), par exemple +33612345678.');
    else value.phone = p;
  }
  if (has('address')) {
    const a = body.address;
    if (!isObj(a)) errors.push('Adresse invalide.');
    else {
      const street = str(a.street);
      const postalCode = str(a.postalCode);
      const city = str(a.city);
      if (street.length < 3 || street.length > 200) errors.push('Rue : 3 à 200 caractères.');
      else if (isPoBox(street)) errors.push('Une boîte postale n’est pas acceptée : indiquez l’adresse physique.');
      if (!postalOk(String(country).toUpperCase(), postalCode)) errors.push('Code postal invalide pour le pays de l’entreprise.');
      if (city.length < 2 || city.length > 100) errors.push('Ville : 2 à 100 caractères.');
      if (!errors.length) value.address = { street, postalCode, city };
    }
  }
  return { value: errors.length ? {} : value, errors };
}
