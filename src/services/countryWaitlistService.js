import CountryWaitlist from '../models/CountryWaitlist.js';
import { countryWaitlistEmail } from '../utils/harxMessages.js';
import { sendAppEmail } from './brevoMail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const PRODUCTS = ['callcentre'];
/** Pays déjà ouverts : on n'inscrit pas sur une liste d'attente un pays disponible. */
const OPEN_COUNTRIES = ['FR'];

const regionNames = (locale) => {
  try {
    return new Intl.DisplayNames([locale || 'fr'], { type: 'region' });
  } catch {
    return null;
  }
};

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export async function joinWaitlist({ email, country, product = 'callcentre', companyName = '', locale = null }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw fail('A valid email is required');
  if (!COUNTRY_RE.test(String(country || ''))) throw fail('A two-letter country code is required');
  const cc = String(country).toUpperCase();
  const prod = String(product || 'callcentre').toLowerCase();
  if (!PRODUCTS.includes(prod)) throw fail('Unknown product');
  if (OPEN_COUNTRIES.includes(cc)) throw fail('This country is already available: create your account instead');

  const existing = await CountryWaitlist.findOne({ email: cleanEmail, product: prod, country: cc });
  if (existing) return { created: false, country: cc };

  const entry = await CountryWaitlist.create({
    email: cleanEmail,
    country: cc,
    product: prod,
    companyName: String(companyName || '').trim().slice(0, 200),
    locale: locale ? String(locale).slice(0, 10) : null,
  });

  try {
    const countryName = regionNames(locale)?.of(cc) || cc;
    const message = countryWaitlistEmail({ countryName, locale });
    await sendAppEmail({ to: cleanEmail, subject: message.subject, html: message.html });
    entry.confirmationSentAt = new Date();
    await entry.save();
  } catch {
    // La demande reste enregistrée même si l'e-mail de confirmation échoue.
  }
  return { created: true, country: cc };
}
