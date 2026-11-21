import CountryWaitlist from '../models/CountryWaitlist.js';
import { countryWaitlistEmail, numbersWaitlistEmail } from '../utils/harxMessages.js';
import { sendAppEmail } from './brevoMail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const PRODUCTS = ['callcentre'];
/** Pays déjà ouverts : on n'inscrit pas sur une liste d'attente « pays » un pays disponible. */
const OPEN_COUNTRIES = ['FR'];
/**
 * `country` (défaut, CLOUD) : le pays n'est pas encore ouvert, aucun compte n'est créé.
 * `numbers` : abonné Nomad Solo, compte déjà créé, qui attend qu'un numéro soit disponible dans ce pays (tout pays, FR/GB/US compris).
 */
export const KINDS = ['country', 'numbers'];

const regionNames = (locale) => {
  try {
    return new Intl.DisplayNames([locale || 'fr'], { type: 'region' });
  } catch {
    return null;
  }
};

/** E-mail de confirmation selon la liste : « numéros » (abonné Solo avec compte) ou « pays » (CLOUD, aucun compte). */
export function waitlistMessage({ kind = 'country', countryName, countryCode, locale }) {
  return kind === 'numbers' ? numbersWaitlistEmail({ countryName, countryCode, locale }) : countryWaitlistEmail({ countryName, countryCode, locale });
}

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export async function joinWaitlist({ email, country, product = 'callcentre', companyName = '', locale = null, kind = 'country' }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw fail('A valid email is required');
  if (!COUNTRY_RE.test(String(country || ''))) throw fail('A two-letter country code is required');
  const cc = String(country).toUpperCase();
  const prod = String(product || 'callcentre').toLowerCase();
  if (!PRODUCTS.includes(prod)) throw fail('Unknown product');
  const k = String(kind || 'country').toLowerCase();
  if (!KINDS.includes(k)) throw fail('Unknown waiting-list kind');
  if (k === 'country' && OPEN_COUNTRIES.includes(cc)) throw fail('This country is already available: create your account instead');

  // Entrées « pays » enregistrées avant l'ajout de `kind` : sans champ, elles comptent comme `country`.
  const kindFilter = k === 'country' ? { kind: { $ne: 'numbers' } } : { kind: 'numbers' };
  const existing = await CountryWaitlist.findOne({ email: cleanEmail, product: prod, country: cc, ...kindFilter });
  if (existing) return { created: false, country: cc, kind: k };

  let entry;
  try {
    entry = await CountryWaitlist.create({
      email: cleanEmail,
      country: cc,
      product: prod,
      kind: k,
      companyName: String(companyName || '').trim().slice(0, 200),
      locale: locale ? String(locale).slice(0, 10) : null,
    });
  } catch (error) {
    // Ancien index unique (email, produit, pays) encore présent en base : la demande existe déjà sous l'autre liste.
    if (error?.code === 11000) return { created: false, country: cc, kind: k };
    throw error;
  }

  try {
    const countryName = regionNames(locale)?.of(cc) || cc;
    const message = waitlistMessage({ kind: k, countryName, countryCode: cc, locale });
    await sendAppEmail({ to: cleanEmail, subject: message.subject, html: message.html });
    entry.confirmationSentAt = new Date();
    await entry.save();
  } catch {
    // La demande reste enregistrée même si l'e-mail de confirmation échoue.
  }
  return { created: true, country: cc, kind: k };
}
