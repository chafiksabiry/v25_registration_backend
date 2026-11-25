import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import authService from '../services/authService.js';
import userRepository from '../repositories/userRepository.js';
import {
  JOURNEY_MILESTONES,
  JOURNEY_FILTERS,
  journeyStampUpdate,
  matchesJourneyFilter,
  normalizeEntry,
  pickSignup,
  summarizeJourney,
} from '../utils/signupJourney.js';
import { stampJourney, workspaceMilestones } from '../services/signupJourney.js';

const NOW = new Date('2026-11-25T10:00:00Z');

test('pickSignup : listes fermées, l’adresse impose son offre, aucun texte libre', () => {
  assert.equal(pickSignup(undefined), undefined, 'ancien site : rien n’est inventé');
  assert.equal(pickSignup('nomad'), undefined);
  assert.deepEqual(pickSignup({ offer: 'nomad', entry: '/nomad/inscription', lang: 'fr-FR' }, { now: NOW }), {
    offer: 'nomad', product: null, entry: '/nomad/inscription', lang: 'fr', country: null, at: NOW,
  });
  // Adresse NOMAD : CLOUD envoyé par le corps ignoré ; préfixe de langue et paramètres retirés.
  assert.deepEqual(pickSignup({ offer: 'cloud', product: 'entreprise', entry: '/fr/nomad/inscription?step=email' }, { now: NOW }).offer, 'nomad');
  const rec = pickSignup({ offer: 'nomad', entry: '/cloud/receptionist/inscription/compte/', lang: 'en' }, { now: NOW });
  assert.deepEqual([rec.offer, rec.product, rec.entry], ['cloud', 'receptionist', '/cloud/receptionist/inscription/compte']);
  // Ancienne adresse partagée : l'offre du parcours en cours, parmi NOMAD / CLOUD seulement.
  const legacy = pickSignup({ offer: 'cloud', product: 'contact_centre', entry: '/auth/register-call-center' }, { now: NOW });
  assert.deepEqual([legacy.offer, legacy.product], ['cloud', 'contact_centre']);
  assert.equal(pickSignup({ offer: 'taas', entry: '/auth/register-call-center' }, { now: NOW }).offer, null);
  assert.equal(pickSignup({ offer: 'nomad', product: 'receptionist', entry: '/auth/register-call-center' }, { now: NOW }).product, null, 'produit seulement pour CLOUD');
  assert.equal(pickSignup({ offer: 'cloud', entry: '/auth/register-rep' }, { now: NOW }).offer, null, 'agent : aucune offre');
  // Valeurs hors liste : null, jamais recopiées.
  const junk = pickSignup({ offer: 'admin', product: '<b>x</b>', entry: 'https://evil.example/nomad/inscription', lang: 'xx', country: 'ZZ', at: '2000-01-01', extra: 1 }, { now: NOW });
  assert.deepEqual(junk, { offer: null, product: null, entry: null, lang: null, country: null, at: NOW });
  // Pays : celui du site s'il est valide, sinon celui de la connexion (IP).
  assert.equal(pickSignup({ country: 'fr' }, { now: NOW, ipCountry: 'MA' }).country, 'FR');
  assert.equal(pickSignup({}, { now: NOW, ipCountry: 'MA' }).country, 'MA');
  assert.equal(normalizeEntry('/es/auth/register-company'), '/auth/register-company');
  assert.equal(normalizeEntry('/auth/inconnue'), null);
});

test('register : signup filtré et journey.account_created fixés par le serveur', async () => {
  const created = [];
  const saved = { findByEmail: userRepository.findByEmail, create: userRepository.create, enrich: authService.enrichIPInfo, mail: authService.sendVerificationEmail };
  userRepository.findByEmail = async () => null;
  userRepository.create = async (data) => {
    const doc = new User(data);
    const err = doc.validateSync();
    if (err) throw err;
    created.push({ data, doc });
    return doc;
  };
  authService.enrichIPInfo = async () => {
    const loc = { region: 'R', city: 'C', isp: null, postal: null, coordinates: null, location: new mongoose.Types.ObjectId() };
    Object.defineProperty(loc, 'countryCode', { value: 'MA', enumerable: false });
    return loc;
  };
  authService.sendVerificationEmail = async () => {};
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' };
  try {
    await authService.register({
      fullName: 'Nina', email: 'nina@ex.com', password: 'motdepasse1',
      signup: { offer: 'cloud', entry: '/nomad/inscription', lang: 'ar', at: '1999-01-01' },
      journey: { account_created: '2000-01-01', payment_succeeded: '2000-01-02' },
    }, req);
    const { data, doc } = created.at(-1);
    assert.equal(doc.signup.offer, 'nomad');
    assert.equal(doc.signup.entry, '/nomad/inscription');
    assert.equal(doc.signup.lang, 'ar');
    assert.equal(doc.signup.country, 'MA', 'pays de connexion');
    assert.ok(doc.signup.at.getFullYear() > 2000);
    assert.ok(doc.journey.account_created.getFullYear() > 2000, 'date du serveur, pas celle du corps');
    assert.equal(doc.journey.payment_succeeded, undefined, 'aucune étape envoyée par le client');
    assert.equal(doc.signup.at.getTime(), doc.journey.account_created.getTime());
    // L'historique IP garde exactement ses champs habituels (pas de pays ajouté).
    assert.equal('countryCode' in doc.ipHistory[0].locationInfo.toObject(), false);
    assert.equal(Object.keys(data.ipHistory[0].locationInfo).includes('countryCode'), false);

    // Ancien site (sans signup) : pas de `signup`, mais le parcours commence quand même.
    await authService.register({ fullName: 'Old', email: 'old@ex.com', password: 'motdepasse1' }, req);
    const old = created.at(-1).doc;
    assert.equal(old.signup, undefined);
    assert.ok(old.journey.account_created instanceof Date);
  } finally {
    userRepository.findByEmail = saved.findByEmail;
    userRepository.create = saved.create;
    authService.enrichIPInfo = saved.enrich;
    authService.sendVerificationEmail = saved.mail;
  }
});

/** Collection en mémoire qui applique le filtre conditionnel ($exists) comme MongoDB, pour vérifier l'idempotence. */
function memoryUsers(docs) {
  const get = (doc, path) => path.split('.').reduce((v, k) => v?.[k], doc);
  const matches = (doc, filter) => Object.entries(filter).every(([k, cond]) => {
    if (k === '_id') return String(doc._id) === String(cond);
    if (cond && typeof cond === 'object' && '$exists' in cond) return (get(doc, k) !== undefined) === cond.$exists;
    return get(doc, k) === cond;
  });
  return {
    docs,
    updateOne: async (filter, update) => {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { modifiedCount: 0 };
      for (const [path, v] of Object.entries(update.$set)) {
        const keys = path.split('.');
        let o = doc;
        for (const k of keys.slice(0, -1)) o = o[k] ??= {};
        o[keys.at(-1)] = v;
      }
      return { modifiedCount: 1 };
    },
  };
}

test('étapes : première fois seulement, comptes au parcours enregistré seulement', async () => {
  const id = new mongoose.Types.ObjectId();
  const oldId = new mongoose.Types.ObjectId();
  const users = memoryUsers([
    { _id: id, journey: { account_created: new Date('2026-11-25T09:00:00Z') } },
    { _id: oldId },
  ]);
  const original = User.collection.updateOne;
  User.collection.updateOne = users.updateOne;
  try {
    assert.equal(await stampJourney(id, 'email_verified', { at: new Date('2026-11-25T09:05:00Z') }), true);
    assert.equal(await stampJourney(id, 'email_verified', { at: new Date('2026-11-25T11:00:00Z') }), false, 'rejoué : date inchangée');
    assert.equal(users.docs[0].journey.email_verified.toISOString(), '2026-11-25T09:05:00.000Z');
    assert.equal(await stampJourney(oldId, 'email_verified'), false, 'compte antérieur : rien n’est posé');
    assert.equal(users.docs[1].journey, undefined);
    assert.equal(await stampJourney(id, 'inconnue'), false);
    assert.equal(await stampJourney(id, 'account_created'), false, 'posée seulement à la création');
    assert.equal(await stampJourney('pas-un-id', 'email_verified'), false);
    assert.equal(await stampJourney(id, 'trial_call'), false, 'issue obligatoire');
    assert.equal(await stampJourney(id, 'trial_call', { outcome: 'done' }), true);
    assert.equal(await stampJourney(id, 'trial_call', { outcome: 'skipped' }), false);
    assert.equal(users.docs[0].journey.trial_call_outcome, 'done');
  } finally {
    User.collection.updateOne = original;
  }
  // Écriture en échec : jamais bloquant.
  User.collection.updateOne = async () => { throw new Error('panne'); };
  try {
    assert.equal(await stampJourney(id, 'phone_verified'), false);
  } finally {
    User.collection.updateOne = original;
  }
  const op = journeyStampUpdate(id, 'number_chosen', { at: NOW });
  assert.deepEqual(op.filter, { _id: id, 'journey.account_created': { $exists: true }, 'journey.number_chosen': { $exists: false } });
  assert.deepEqual(op.update, { $set: { 'journey.number_chosen': NOW } });
});

test('mise en route du portail : « Votre offre » terminée et fin de la mise en route', () => {
  assert.deepEqual(workspaceMilestones({}), []);
  assert.deepEqual(workspaceMilestones({ company: { onboarding: { done: false, timings: { offer: { startedAt: 1 } } } } }), []);
  assert.deepEqual(workspaceMilestones({ company: { onboarding: { done: false, timings: { offer: { completedAt: 1764064800000 } } } } }), ['offer_chosen']);
  assert.deepEqual(workspaceMilestones({ company: { onboarding: { done: true, timings: { offer: { completedAt: 1 } } } } }), ['offer_chosen', 'onboarding_finished']);
  assert.deepEqual(workspaceMilestones({ company: { onboarding: { done: 'true', timings: { offer: { completedAt: '1' } } } } }), []);
});

test('résumé admin : étapes dans l’ordre, dernière étape, durée totale ; compte antérieur', () => {
  const user = {
    signup: { offer: 'nomad', product: null, entry: '/nomad/inscription', lang: 'fr', country: 'FR', at: new Date('2026-11-25T09:00:00Z') },
    journey: {
      account_created: new Date('2026-11-25T09:00:00Z'),
      email_verified: new Date('2026-11-25T09:03:00Z'),
      trial_call: new Date('2026-11-25T09:20:00Z'),
      trial_call_outcome: 'done',
    },
  };
  const s = summarizeJourney(user);
  assert.equal(s.recorded, true);
  assert.equal(s.status, 'in_progress');
  assert.equal(s.lastReached, 'trial_call');
  assert.deepEqual(s.steps.map((x) => x.id), JOURNEY_MILESTONES);
  assert.equal(s.steps.find((x) => x.id === 'trial_call').outcome, 'done');
  assert.equal(s.steps.find((x) => x.id === 'phone_verified').reached, false);
  assert.equal(s.totalMs, null);
  assert.equal(s.signup.offer, 'nomad');
  assert.ok(matchesJourneyFilter(s, 'stuck:trial_call'));
  assert.ok(!matchesJourneyFilter(s, 'finished'));

  const done = summarizeJourney({ ...user, journey: { ...user.journey, onboarding_finished: new Date('2026-11-25T09:45:00Z') } });
  assert.equal(done.status, 'finished');
  assert.equal(done.totalMs, 45 * 60 * 1000);
  assert.ok(matchesJourneyFilter(done, 'finished'));

  const legacy = summarizeJourney({ createdAt: new Date('2026-01-01') });
  assert.deepEqual([legacy.recorded, legacy.status, legacy.signup, legacy.lastReached], [false, 'unrecorded', null, null]);
  assert.ok(matchesJourneyFilter(legacy, 'unrecorded'));
  assert.ok(JOURNEY_FILTERS.includes('stuck:payment_succeeded'));
});
