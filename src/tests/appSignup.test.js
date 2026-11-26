import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import axios from 'axios';
import {
  validateAppSignup, appSignupRecord, relanceDecision, relanceDelaysHours, relanceDryRun, activationUrl,
  unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, isClaimableAppSignup, publicApiBase, APP_SIGNUP_ENTRY,
} from '../utils/appSignup.js';
import { pickSignup } from '../utils/signupJourney.js';
import { applySignupOffer } from '../services/accountOffer.js';
import { nomadAppEmail, NOMAD_APP_EMAIL_LANGS } from '../utils/nomadAppMessages.js';
import { createAppSignupService, buildAppEmail, APP_SIGNUP_RESPONSE, AppSignupError } from '../services/appSignupService.js';
import { pickMailHeaders, sendBrevoEmail, withRemoteLogo, inlineLogoMail } from '../services/brevoMail.js';

const ENV = { JWT_SECRET: 'test-secret', PUBLIC_API_URL: 'https://reg.example.test', FRONTEND_URL: 'https://front.example.test' };
const ID = '64b7f0c2a1b2c3d4e5f60718';
const T0 = new Date('2026-11-26T10:00:00Z');
const H = 3600 * 1000;

const body = (o = {}) => ({ firstName: ' Alex ', email: ' Alex@Example.COM ', country: 'fr', lang: 'fr', consent: true, ...o });

test('validation : prénom, e-mail, pays ISO2, accord booléen ; langue par défaut en', () => {
  const ok = validateAppSignup(body({ isVerified: true, typeUser: 'admin' }));
  assert.deepEqual(ok, { ok: true, value: { firstName: 'Alex', email: 'alex@example.com', country: 'FR', lang: 'fr', consent: true } });
  assert.equal(validateAppSignup(body({ lang: 'de' })).value.lang, 'en');
  for (const [o, code] of [
    [{ firstName: '' }, 'INVALID_FIRST_NAME'], [{ firstName: 'x'.repeat(61) }, 'INVALID_FIRST_NAME'], [{ firstName: '<b>' }, 'INVALID_FIRST_NAME'],
    [{ email: 'nope' }, 'INVALID_EMAIL'], [{ email: 'a@b' }, 'INVALID_EMAIL'], [{ email: 42 }, 'INVALID_EMAIL'],
    [{ country: 'FRA' }, 'INVALID_COUNTRY'], [{ country: 'ZZ' }, 'INVALID_COUNTRY'], [{ country: '' }, 'INVALID_COUNTRY'],
    [{ consent: 'yes' }, 'INVALID_CONSENT'], [{ consent: undefined }, 'INVALID_CONSENT'],
  ]) assert.equal(validateAppSignup(body(o)).code, code, JSON.stringify(o));
  assert.equal(validateAppSignup(null).ok, false);
});

test('accord enregistré : booléen + date + source ios-app ; offre NOMAD par l’adresse d’entrée', () => {
  assert.deepEqual(appSignupRecord({ consent: false, now: T0 }), {
    source: 'ios-app', at: T0, pending: true, consent: false, consentAt: T0, consentSource: 'ios-app', unsubscribedAt: null,
    relance: { step: 0, lastSentAt: null, stoppedAt: null, stopReason: null, lockUntil: null },
  });
  const signup = pickSignup({ entry: APP_SIGNUP_ENTRY, offer: 'cloud', lang: 'ar', country: 'MA' }, { now: T0 });
  assert.deepEqual(signup, { offer: 'nomad', product: null, entry: '/app/ios', lang: 'ar', country: 'MA', at: T0 });
  assert.equal(applySignupOffer({ offer: null, product: null }, signup).offer, 'nomad');
});

function fakeDb(users = []) {
  const db = { users, sent: [], updates: [], logs: [] };
  const match = (u, filter) => Object.entries(filter).every(([k, v]) => {
    if (k === '$or') return v.some((f) => match(u, f));
    const val = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), u);
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
      if ('$lt' in v) return val != null && val < v.$lt;
      if ('$exists' in v) return (val !== undefined) === v.$exists;
    }
    if (v instanceof mongoose.Types.ObjectId || k === '_id') return String(val) === String(v);
    return (val ?? null) === v;
  });
  db.deps = (over = {}) => ({
    now: () => T0,
    env: { ...ENV },
    log: (m) => db.logs.push(m),
    findUserByEmail: async (email) => users.find((u) => u.email === email) || null,
    createUser: async (doc) => { if (users.some((u) => u.email === doc.email)) { const e = new Error('dup'); e.code = 11000; throw e; } const u = { _id: new mongoose.Types.ObjectId(), ...doc }; users.push(u); return u; },
    updateUser: async (filter, update) => {
      db.updates.push({ filter, update });
      const u = users.find((x) => match(x, filter));
      if (!u) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set)) {
        const parts = k.split('.');
        let o = u;
        for (const p of parts.slice(0, -1)) { o[p] = o[p] || {}; o = o[p]; }
        o[parts.at(-1)] = v;
      }
      return { modifiedCount: 1 };
    },
    sendEmail: async (mail) => { db.sent.push(mail); },
    findRelanceCandidates: async () => users.filter((u) => u.appSignup?.consent && !u.appSignup.unsubscribedAt && !u.appSignup.relance?.stoppedAt),
    lineActive: async () => false,
    ...over,
  });
  return db;
}

test('création : compte NOMAD en attente, accord stocké, e-mail 1 avec désabonnement en un clic', async () => {
  const db = fakeDb();
  const svc = createAppSignupService(db.deps());
  const r = await svc.signup(body(), { headers: {}, ip: '1.2.3.4' });
  await r.background;
  assert.deepEqual(r.response, APP_SIGNUP_RESPONSE);
  assert.equal(r.created, true);
  const u = db.users[0];
  assert.equal(u.email, 'alex@example.com');
  assert.equal(u.fullName, 'Alex');
  assert.equal(u.isVerified, false);
  assert.equal(u.signup.offer, 'nomad');
  assert.equal(u.appSignup.consent, true);
  assert.equal(u.appSignup.consentSource, 'ios-app');
  assert.ok(u.appSignup.consentAt instanceof Date);
  assert.ok(typeof u.password === 'string' && u.password.length === 64);
  assert.equal(db.sent.length, 1);
  assert.equal(db.sent[0].to, 'alex@example.com');
  assert.match(db.sent[0].headers['List-Unsubscribe'], /^<https:\/\/reg\.example\.test\/api\/auth\/app-signup\/unsubscribe\?t=/);
  assert.equal(db.sent[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal(u.appSignup.relance.step, 1);
});

test('création sans accord : e-mail d’activation seul, sans lien ni en-tête de désabonnement, jamais relancé', async () => {
  const db = fakeDb();
  const svc = createAppSignupService(db.deps());
  await (await svc.signup(body({ consent: false }))).background;
  assert.equal(db.users[0].appSignup.consent, false);
  assert.equal(db.sent[0].headers, undefined);
  assert.ok(!/unsubscribe|désabonner/i.test(db.sent[0].html));
  assert.equal(relanceDecision(db.users[0], { now: new Date(T0.getTime() + 30 * H) }).reason, 'no_consent');
});

test('idempotent : e-mail existant -> même réponse, aucun compte modifié, aucun e-mail (ni course sur l’index unique)', async () => {
  const existing = { _id: new mongoose.Types.ObjectId(), email: 'alex@example.com', fullName: 'Old', isVerified: true };
  const db = fakeDb([existing]);
  const svc = createAppSignupService(db.deps());
  const r = await svc.signup(body());
  await r.background;
  assert.deepEqual(r.response, APP_SIGNUP_RESPONSE);
  assert.equal(r.created, false);
  assert.equal(db.users.length, 1);
  assert.equal(db.sent.length, 0);
  assert.equal(db.updates.length, 0);
  // Course : la recherche ne voit rien, l'index unique refuse.
  const svc2 = createAppSignupService(db.deps({ findUserByEmail: async () => null }));
  const r2 = await svc2.signup(body());
  assert.deepEqual(r2.response, APP_SIGNUP_RESPONSE);
  assert.equal(db.sent.length, 0);
});

test('entrée invalide : erreur 400 avec le champ', async () => {
  const svc = createAppSignupService(fakeDb().deps());
  await assert.rejects(svc.signup(body({ country: 'XX' })), (e) => e instanceof AppSignupError && e.statusCode === 400 && e.field === 'country');
});

test('échec de l’e-mail 1 : step reste 0, la tâche le reprendra', async () => {
  const db = fakeDb();
  const svc = createAppSignupService(db.deps({ sendEmail: async () => { throw new Error('smtp down'); } }));
  await (await svc.signup(body())).background;
  assert.equal(db.users[0].appSignup.relance.step, 0);
  assert.equal(relanceDecision(db.users[0], { now: T0 }).action, 'send');
});

const user = (relance = {}, extra = {}) => ({
  _id: new mongoose.Types.ObjectId(ID), email: 'a@example.com', fullName: 'Alex', signup: { lang: 'fr', country: 'FR' },
  appSignup: { ...appSignupRecord({ consent: true, now: T0 }), relance: { step: 1, lastSentAt: T0, stoppedAt: null, stopReason: null, lockUntil: null, ...relance } },
  ...extra,
});

test('calendrier : e-mail 2 à J+1, e-mail 3 à J+3, puis terminé', () => {
  const at = (h) => new Date(T0.getTime() + h * H);
  assert.deepEqual(relanceDecision(user(), { now: at(23) }), { action: 'wait', step: 2, dueAt: at(24) });
  assert.deepEqual(relanceDecision(user(), { now: at(24) }), { action: 'send', step: 2 });
  assert.deepEqual(relanceDecision(user({ step: 2 }), { now: at(71) }).action, 'wait');
  assert.deepEqual(relanceDecision(user({ step: 2 }), { now: at(72) }), { action: 'send', step: 3 });
  assert.deepEqual(relanceDecision(user({ step: 3 }), { now: at(200) }), { action: 'done' });
});

test('arrêts : ligne active, désabonné, désactivé, trop ancien, sans accord', () => {
  const now = new Date(T0.getTime() + 30 * H);
  assert.equal(relanceDecision(user(), { now, lineActive: true }).reason, 'line_active');
  const u = user(); u.appSignup.unsubscribedAt = T0;
  assert.equal(relanceDecision(u, { now }).reason, 'unsubscribed');
  assert.equal(relanceDecision(user({}, { disabled: true }), { now }).reason, 'disabled');
  assert.equal(relanceDecision(user(), { now: new Date(T0.getTime() + 15 * 24 * H) }).reason, 'too_old');
  assert.equal(relanceDecision({ appSignup: { source: 'ios-app', consent: false } }, { now }).reason, 'no_consent');
  assert.equal(relanceDecision({}, { now }).reason, 'not_app_signup');
});

test('variables : simulation par défaut, délais configurables', () => {
  assert.equal(relanceDryRun({}), true);
  assert.equal(relanceDryRun({ NOMAD_RELANCE_DRY_RUN: 'true' }), true);
  assert.equal(relanceDryRun({ NOMAD_RELANCE_DRY_RUN: 'FALSE' }), false);
  assert.deepEqual(relanceDelaysHours({}), [24, 72]);
  assert.deepEqual(relanceDelaysHours({ NOMAD_RELANCE_DELAYS_HOURS: '0.1,0.2' }), [0.1, 0.2]);
  assert.deepEqual(relanceDelaysHours({ NOMAD_RELANCE_DELAYS_HOURS: '72,24' }), [24, 72]);
  assert.deepEqual(relanceDelaysHours({ NOMAD_RELANCE_DELAYS_HOURS: 'abc' }), [24, 72]);
});

test('tâche en simulation : aucun envoi, une ligne de journal par étape', async () => {
  const db = fakeDb([user()]);
  db.users[0].appSignup.at = new Date(T0.getTime() - 25 * H);
  const svc = createAppSignupService(db.deps({ env: { ...ENV } }));
  const r1 = await svc.runRelances();
  const r2 = await svc.runRelances();
  assert.equal(r1.dryRun, true);
  assert.equal(r1.simulated, 1);
  assert.equal(r2.simulated, 0);
  assert.equal(db.sent.length, 0);
  assert.equal(db.users[0].appSignup.relance.step, 1);
});

test('tâche réelle : envoie l’e-mail 2 une seule fois, puis rien avant J+3 ; ligne active -> arrêt', async () => {
  const db = fakeDb([user()]);
  db.users[0].appSignup.at = new Date(T0.getTime() - 25 * H);
  const env = { ...ENV, NOMAD_RELANCE_DRY_RUN: 'false' };
  const svc = createAppSignupService(db.deps({ env }));
  assert.equal((await svc.runRelances()).sent, 1);
  assert.equal((await svc.runRelances()).sent, 0);
  assert.equal(db.sent.length, 1);
  assert.equal(db.sent[0].subject, 'Votre numéro vous suit à l’étranger, sans roaming');
  assert.equal(db.users[0].appSignup.relance.step, 2);
  assert.equal(db.users[0].appSignup.relance.lockUntil, null);
  const active = createAppSignupService(db.deps({ env, lineActive: async () => true }));
  const r = await active.runRelances();
  assert.equal(r.stopped, 1);
  assert.equal(db.users[0].appSignup.relance.stopReason, 'line_active');
  assert.equal((await active.runRelances()).examined, 0);
});

test('tâche réelle : un e-mail déjà réservé (verrou) n’est pas renvoyé ; un échec libère le verrou', async () => {
  const db = fakeDb([user({ lockUntil: new Date(T0.getTime() + 60000) })]);
  db.users[0].appSignup.at = new Date(T0.getTime() - 25 * H);
  const env = { ...ENV, NOMAD_RELANCE_DRY_RUN: 'false' };
  assert.equal((await createAppSignupService(db.deps({ env })).runRelances()).sent, 0);
  db.users[0].appSignup.relance.lockUntil = null;
  const failing = createAppSignupService(db.deps({ env, sendEmail: async () => { throw new Error('down'); } }));
  assert.equal((await failing.runRelances()).failed, 1);
  assert.equal(db.users[0].appSignup.relance.lockUntil, null);
  assert.equal(db.users[0].appSignup.relance.step, 1);
});

test('désabonnement : jeton signé, idempotent, faux jeton refusé ; arrête les relances', async () => {
  const tok = unsubscribeToken(ID, ENV);
  assert.equal(verifyUnsubscribeToken(tok, ENV), ID);
  assert.equal(verifyUnsubscribeToken(tok, { JWT_SECRET: 'other' }), null);
  assert.equal(verifyUnsubscribeToken(`${ID}.AAAA`, ENV), null);
  assert.equal(verifyUnsubscribeToken('garbage', ENV), null);
  assert.equal(unsubscribeUrl(ID, ENV), `https://reg.example.test/api/auth/app-signup/unsubscribe?t=${encodeURIComponent(tok)}`);
  const db = fakeDb([user()]);
  const svc = createAppSignupService(db.deps());
  assert.equal(await svc.unsubscribe('bad'), false);
  assert.equal(await svc.unsubscribe(tok), true);
  const at = db.users[0].appSignup.unsubscribedAt;
  assert.ok(at instanceof Date);
  assert.equal(await svc.unsubscribe(tok), true);
  assert.equal(db.users[0].appSignup.unsubscribedAt, at);
  assert.equal(relanceDecision(db.users[0], { now: new Date(T0.getTime() + 30 * H) }).reason, 'unsubscribed');
});

test('adresse publique : PUBLIC_API_URL, sinon le domaine Railway de l’environnement', () => {
  assert.equal(publicApiBase({ RAILWAY_PUBLIC_DOMAIN: 'reg-recette.up.railway.app' }), 'https://reg-recette.up.railway.app');
  assert.equal(publicApiBase({ PUBLIC_API_URL: 'https://a.test/', RAILWAY_PUBLIC_DOMAIN: 'b' }), 'https://a.test');
});

test('lien d’activation : inscription NOMAD du site, e-mail et langue préremplis', () => {
  assert.equal(activationUrl({ email: 'a+b@x.fr', lang: 'es' }, { FRONTEND_URL: 'https://harx.ai/auth/' }),
    'https://harx.ai/nomad/inscription?email=a%2Bb%40x.fr&lang=es&utm_source=nomad-app&utm_medium=email');
  assert.match(activationUrl({ email: 'a@x.fr' }, { NOMAD_ACTIVATION_URL: 'https://recette.example/nomad/inscription/' }), /^https:\/\/recette\.example\/nomad\/inscription\?email=/);
});

test('e-mails : 4 langues x 3 e-mails, mot-symbole en image, jamais le mot NOMAD en texte, aucun prix', () => {
  assert.deepEqual(NOMAD_APP_EMAIL_LANGS, ['fr', 'en', 'es', 'ar']);
  for (const lang of NOMAD_APP_EMAIL_LANGS) {
    for (const step of [1, 2, 3]) {
      const m = nomadAppEmail({ step, lang, firstName: 'Alex <b>', country: 'FR', activationUrl: 'https://harx.ai/nomad/inscription?email=a%40b.fr', unsubscribeUrl: 'https://reg/u?t=1' });
      const visible = m.html.replace(/<[^>]+>/g, ' ');
      assert.ok(!/nomad/i.test(m.subject), `${lang}${step} objet`);
      assert.ok(!/NOMAD/.test(visible), `${lang}${step} texte visible`);
      assert.ok(!/NOMAD/.test(m.text), `${lang}${step} version texte`);
      assert.ok(m.html.includes('src="cid:harx-logo"'), 'bandeau intégré');
      if (step !== 3) assert.ok(m.html.includes('src="cid:nomad-wordmark"'), `${lang}${step} mot-symbole`);
      assert.ok(!/19[,.]99|€|\$|USD/.test(m.html + m.text), 'aucun prix');
      assert.ok(m.html.includes('https://reg/u?t=1') && m.text.includes('https://reg/u?t=1'), 'désabonnement');
      assert.ok(!m.html.includes('<b>'), 'prénom échappé');
      assert.ok(!/undefined|\$\{/.test(m.html + m.text));
      if (lang === 'ar') assert.ok(m.html.includes('dir="rtl"'));
    }
  }
  assert.match(nomadAppEmail({ step: 3, lang: 'fr', country: 'FR', activationUrl: 'x' }).html, /en France/);
  assert.doesNotMatch(nomadAppEmail({ step: 3, lang: 'fr', country: 'BE', activationUrl: 'x' }).html, /France/);
});

test('buildAppEmail : langue et pays du parcours, en-têtes seulement avec accord', () => {
  const m = buildAppEmail(user({}, { signup: { lang: 'ar', country: 'MA' } }), 2, ENV);
  assert.equal(m.subject, 'رقمك يرافقك في الخارج، دون تجوال');
  assert.ok(m.headers['List-Unsubscribe']);
  const u = user(); u.appSignup.consent = false;
  assert.equal(buildAppEmail(u, 1, ENV).headers, undefined);
});

test('envoi : en-têtes List-Unsubscribe transmis (API Brevo), autres en-têtes ignorés ; mot-symbole joint ou en URL', async () => {
  assert.deepEqual(pickMailHeaders({ 'List-Unsubscribe': '<https://u>', 'X-Evil': 'x', 'List-Unsubscribe-Post': 'a\r\nb' }), { 'List-Unsubscribe': '<https://u>' });
  const saved = { k: process.env.BREVO_API_KEY, s: process.env.BREVO_SENDER_EMAIL };
  process.env.BREVO_API_KEY = 'k'; process.env.BREVO_SENDER_EMAIL = 'no-reply@example.test';
  const realPost = axios.post;
  let sent = null;
  axios.post = async (_u, b) => { sent = b; return { data: {} }; };
  try {
    await sendBrevoEmail({ to: 'a@b.fr', subject: 's', html: '<img src="cid:nomad-wordmark">', headers: { 'List-Unsubscribe': '<https://u>' } });
  } finally {
    axios.post = realPost;
    if (saved.k === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = saved.k;
    if (saved.s === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = saved.s;
  }
  assert.deepEqual(sent.headers, { 'List-Unsubscribe': '<https://u>' });
  assert.match(sent.htmlContent, /\/email\/nomad-wordmark\.png/);
  assert.match(withRemoteLogo('cid:nomad-wordmark'), /nomad-wordmark\.png$/);
  const inline = inlineLogoMail('<img src="cid:harx-logo"><img src="cid:nomad-wordmark">');
  assert.deepEqual(inline.attachments.map((a) => a.cid), ['harx-logo', 'nomad-wordmark']);
});

test('reprise par l’inscription web : seulement un compte de l’app en attente, non vérifié, actif', () => {
  const pending = { isVerified: false, appSignup: { source: 'ios-app', pending: true } };
  assert.equal(isClaimableAppSignup(pending), true);
  assert.equal(isClaimableAppSignup({ ...pending, isVerified: true }), false);
  assert.equal(isClaimableAppSignup({ ...pending, disabled: true }), false);
  assert.equal(isClaimableAppSignup({ ...pending, appSignup: { source: 'ios-app', pending: false } }), false);
  assert.equal(isClaimableAppSignup({ isVerified: false }), false);
  assert.equal(isClaimableAppSignup(null), false);
});
