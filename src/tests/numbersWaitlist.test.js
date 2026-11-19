import assert from 'node:assert/strict';

// Aucun e-mail réel : sans identifiants Brevo ni SMTP, l'envoi échoue avant tout appel réseau (l'échec est ignoré par le service).
for (const k of ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_FROM_EMAIL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL']) delete process.env[k];

const { default: CountryWaitlist } = await import('../models/CountryWaitlist.js');
const { joinWaitlist, waitlistMessage } = await import('../services/countryWaitlistService.js');
const { numbersWaitlistEmail, countryWaitlistEmail } = await import('../utils/harxMessages.js');

// Pas de base : on capte les lectures et écritures du modèle.
const created = [];
const queries = [];
CountryWaitlist.findOne = async (q) => { queries.push(q); return null; };
CountryWaitlist.create = async (data) => {
  const doc = new CountryWaitlist(data);
  const err = doc.validateSync();
  if (err) throw err;
  created.push(data);
  doc.save = async () => doc;
  return doc;
};

// 1. Liste « numéros » : France, Royaume-Uni, États-Unis acceptés (abonné Solo dont le stock manque), avec le bon type.
for (const country of ['FR', 'GB', 'US', 'DZ']) {
  const r = await joinWaitlist({ email: 'Ada@Example.com', country, kind: 'numbers', locale: 'en' });
  assert.deepEqual(r, { created: true, country, kind: 'numbers' }, `numbers ${country}`);
}
assert.ok(created.every((d) => d.kind === 'numbers' && d.email === 'ada@example.com'));
assert.deepEqual(queries.at(-1), { email: 'ada@example.com', product: 'callcentre', country: 'DZ', kind: 'numbers' });

// 2. Liste « pays » (CLOUD) inchangée : la France ouverte est refusée, un autre pays accepté ; anciennes entrées sans `kind` comptées.
await assert.rejects(() => joinWaitlist({ email: 'a@b.fr', country: 'FR' }), /already available/);
const r = await joinWaitlist({ email: 'a@b.fr', country: 'DE' });
assert.deepEqual(r, { created: true, country: 'DE', kind: 'country' });
assert.equal(created.at(-1).kind, 'country');
assert.deepEqual(queries.at(-1).kind, { $ne: 'numbers' });
await assert.rejects(() => joinWaitlist({ email: 'a@b.fr', country: 'DE', kind: 'other' }), /Unknown waiting-list kind/);

// 3. Déjà inscrit sur la même liste : rien de recréé.
CountryWaitlist.findOne = async () => ({ _id: 'x' });
assert.deepEqual(await joinWaitlist({ email: 'a@b.fr', country: 'MA', kind: 'numbers' }), { created: false, country: 'MA', kind: 'numbers' });
// Ancien index unique (email, produit, pays) encore en base : doublon toléré, pas d'erreur 500.
CountryWaitlist.findOne = async () => null;
CountryWaitlist.create = async () => { const e = new Error('dup'); e.code = 11000; throw e; };
assert.deepEqual(await joinWaitlist({ email: 'a@b.fr', country: 'MA', kind: 'numbers' }), { created: false, country: 'MA', kind: 'numbers' });

// 4. E-mail « numéros » : compte existant, aucun numéro encore disponible ; jamais « pas encore ouvert » ni « aucun compte ».
const texts = {
  fr: /Aucun numéro n'est encore disponible en Algérie\. Nous vous prévenons dès qu'il y en a un\./,
  en: /No number is available yet in Algeria; we will notify you as soon as one is\./,
  es: /Todavía no hay ningún número disponible en Argelia; le avisaremos en cuanto haya uno\./,
  ar: /لا يتوفر أي رقم بعد في الجزائر/,
};
const names = { fr: 'Algérie', en: 'Algeria', es: 'Argelia', ar: 'الجزائر' };
for (const [locale, re] of Object.entries(texts)) {
  const m = numbersWaitlistEmail({ countryName: names[locale], locale });
  assert.match(m.html, re, `numbers ${locale}`);
  assert.ok(m.subject.includes(names[locale]), `objet ${locale}`);
  assert.doesNotMatch(m.html, /pas encore ouvert|not yet open|aucun compte|no account has been created/, `numbers ${locale} : pas le texte « pays »`);
}
assert.equal(waitlistMessage({ kind: 'numbers', countryName: 'Algeria', locale: 'en' }).subject, numbersWaitlistEmail({ countryName: 'Algeria', locale: 'en' }).subject);
assert.equal(waitlistMessage({ countryName: 'Allemagne', locale: 'fr' }).subject, countryWaitlistEmail({ countryName: 'Allemagne', locale: 'fr' }).subject);
assert.match(countryWaitlistEmail({ countryName: 'Allemagne', locale: 'fr' }).html, /aucun compte n'a été créé/);
// Échappement HTML du nom de pays.
assert.ok(!numbersWaitlistEmail({ countryName: '<b>X</b>', locale: 'fr' }).html.includes('<b>X</b>'));

// 5. Français : bonne préposition devant le pays (au Maroc, aux États-Unis, en France, à Malte), jamais « en Maroc ».
const { frInCountry } = await import('../utils/frCountryPreposition.js');
const fr = { MA: ['Maroc', 'au Maroc'], US: ['États-Unis', 'aux États-Unis'], FR: ['France', 'en France'], MT: ['Malte', 'à Malte'], GB: ['Royaume-Uni', 'au Royaume-Uni'],
  IR: ['Iran', 'en Iran'], MX: ['Mexique', 'au Mexique'], DZ: ['Algérie', 'en Algérie'], AE: ['Émirats arabes unis', 'aux Émirats arabes unis'], SG: ['Singapour', 'à Singapour'] };
for (const [cc, [name, expected]] of Object.entries(fr)) {
  assert.equal(frInCountry(cc, name), expected, cc);
  const m = numbersWaitlistEmail({ countryName: name, countryCode: cc, locale: 'fr' });
  assert.ok(m.html.includes(`disponible ${expected}`), `e-mail ${cc}`);
  assert.ok(m.subject.endsWith(`disponible ${expected}`), `objet ${cc}`);
  assert.doesNotMatch(m.subject, / en (Maroc|États-Unis|Malte|Royaume-Uni|Mexique)/);
}
// Pays hors table et nom masculin sans « e » final : tournure neutre plutôt qu'une faute.
assert.equal(frInCountry('ZZ', 'Groland'), 'dans le pays : Groland');
assert.match(countryWaitlistEmail({ countryName: 'Maroc', countryCode: 'MA', locale: 'fr' }).html, /pas encore ouvert au Maroc\./);
// Autres langues inchangées.
assert.match(numbersWaitlistEmail({ countryName: 'Morocco', countryCode: 'MA', locale: 'en' }).html, /available yet in Morocco;/);

console.log('numbersWaitlist OK');
