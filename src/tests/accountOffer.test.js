import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  offerFromTier,
  offerFromAccountProfile,
  resolveAccountOfferDetail,
  lastKnownTierFromSubscriptions,
  loadAccountOffers,
  loadAccountOffer,
} from '../services/accountOffer.js';
import { resolveAccountOffer } from '../services/accountClosureService.js';
import { matchesOfferFilter, publicAccountOffer } from '../services/adminService.js';
import { productFromPlanMetadata } from '../services/companyProduct.js';

const meta = (tier) => ({ harx_product: 'callcenter', callcenter_tier: tier });

test('palier -> offre / produit (Nomad Solo = NOMAD ; Receptionist / Entreprise / Contact Centre = CLOUD)', () => {
  assert.deepEqual(offerFromTier('nomad_solo'), { offer: 'nomad', product: null });
  assert.deepEqual(offerFromTier('accueil'), { offer: 'cloud', product: 'receptionist' });
  assert.deepEqual(offerFromTier('full_scope'), { offer: 'cloud', product: 'entreprise' });
  assert.deepEqual(offerFromTier('multi_clients'), { offer: 'cloud', product: 'contact_centre' });
  assert.equal(offerFromTier('inconnu'), null);
  assert.equal(offerFromTier(null), null);
  // Anciennes valeurs Stripe (normalizePlanId) : même produit que le palier actuel.
  assert.deepEqual(offerFromTier(productFromPlanMetadata(meta('essentiel'))), { offer: 'nomad', product: null });
  assert.deepEqual(offerFromTier(productFromPlanMetadata(meta('equipe'))), { offer: 'cloud', product: 'entreprise' });
  assert.deepEqual(offerFromTier(productFromPlanMetadata(meta('multi_pays'))), { offer: 'cloud', product: 'contact_centre' });
});

test('profil du portail : solo = NOMAD, company = CLOUD sans produit', () => {
  assert.deepEqual(offerFromAccountProfile('solo'), { offer: 'nomad', product: null });
  assert.deepEqual(offerFromAccountProfile('company'), { offer: 'cloud', product: null });
  assert.equal(offerFromAccountProfile('autre'), null);
  assert.equal(offerFromAccountProfile(undefined), null);
});

test('resolveAccountOfferDetail : palier d’abord, puis profil, sinon inconnue ; resolveAccountOffer inchangé', async () => {
  const states = (rows) => async () => rows;
  const d1 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'accueil', workspaceStates: states([{ data: { accountProfile: 'solo' } }]) });
  assert.deepEqual(d1, { offer: 'cloud', product: 'receptionist', source: 'subscription', tier: 'accueil', accountProfile: null });
  const d2 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: { accountProfile: 'solo' } }]) });
  assert.deepEqual(d2, { offer: 'nomad', product: null, source: 'accountProfile', tier: null, accountProfile: 'solo' });
  const d3 = await resolveAccountOfferDetail({ companyIds: [], lastKnownTier: async () => 'nomad_solo', workspaceStates: states([]) });
  assert.equal(d3.offer, null);
  // L'e-mail de suppression garde la même valeur (« nomad » / « cloud » / null).
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => 'multi_clients', workspaceStates: states([]) }), 'cloud');
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: {} }]) }), null);
});

test('dernier palier connu à partir des abonnements lus (même règle que getLastKnownCompanyProduct)', () => {
  const plans = new Map([['p_solo', { metadata: meta('nomad_solo') }], ['p_acc', { metadata: meta('accueil') }], ['p_x', { metadata: {} }]]);
  assert.equal(lastKnownTierFromSubscriptions([{ status: 'canceled', planId: 'p_solo' }, { status: 'active', planId: 'p_acc' }], plans), 'accueil', 'actif d’abord');
  assert.equal(lastKnownTierFromSubscriptions([{ status: 'past_due', planId: 'p_solo' }], plans), 'nomad_solo', 'impayé : palier gardé');
  assert.equal(lastKnownTierFromSubscriptions([{ status: 'canceled', planId: 'p_x' }, { status: 'canceled', planId: 'p_acc' }], plans), 'accueil');
  assert.equal(lastKnownTierFromSubscriptions([], plans), null);
});

// --- Faux db : compte les requêtes pour vérifier le regroupement (pas une lecture par compte). ---
const idIn = (value, list) => list.some((x) => String(x) === String(value));
function fakeDb(data) {
  const calls = [];
  const match = (name, filter, doc) => {
    if (name === 'companies' && filter.userId) return idIn(doc.userId, filter.userId.$in);
    if (name === 'companies' && filter._id) return String(doc._id) === String(filter._id);
    if (name === 'subscriptions') return idIn(doc.companyId, filter.companyId.$in);
    if (name === 'subscriptionplans') return idIn(doc._id, filter._id.$in);
    if (name === 'callcenter_workspace_state') {
      const ok = filter.companyId.$in ? idIn(doc.companyId, filter.companyId.$in) : String(doc.companyId) === String(filter.companyId);
      return ok && doc.scope === filter.scope;
    }
    return false;
  };
  return {
    calls,
    collection: (name) => ({
      find: (filter) => {
        calls.push(name);
        const rows = (data[name] || []).filter((doc) => match(name, filter, doc));
        const cursor = { project: () => cursor, sort: () => cursor, toArray: async () => rows };
        return cursor;
      },
      findOne: async (filter) => {
        calls.push(`${name}.findOne`);
        return (data[name] || []).find((doc) => match(name, filter, doc)) || null;
      },
    }),
  };
}

const oid = (n) => new mongoose.Types.ObjectId(n.padStart(24, '0'));

test('liste admin : offre de toute la page en 4 lectures groupées, quelle que soit sa taille', async () => {
  const users = Array.from({ length: 30 }, (_, i) => oid(`a${i}`));
  const companies = users.map((u, i) => ({ _id: oid(`c${i}`), userId: u }));
  const plans = [
    { _id: oid('f1'), metadata: meta('nomad_solo') },
    { _id: oid('f2'), metadata: meta('accueil') },
    { _id: oid('f3'), metadata: meta('full_scope') },
    { _id: oid('f4'), metadata: meta('multi_clients') },
  ];
  const subscriptions = [
    { companyId: String(companies[0]._id), status: 'active', planId: String(plans[0]._id), createdAt: new Date('2026-11-01') },
    { companyId: String(companies[1]._id), status: 'active', planId: String(plans[1]._id), createdAt: new Date('2026-11-01') },
    { companyId: companies[2]._id, status: 'trialing', planId: plans[2]._id, createdAt: new Date('2026-11-01') },
    // Annulé puis plus récent impayé : le dernier palier connu compte.
    { companyId: String(companies[3]._id), status: 'canceled', planId: String(plans[1]._id), createdAt: new Date('2026-10-01') },
    { companyId: String(companies[3]._id), status: 'past_due', planId: String(plans[3]._id), createdAt: new Date('2026-11-01') },
  ];
  const states = [
    { companyId: companies[4]._id, scope: 'company', data: { accountProfile: 'solo' } },
    { companyId: companies[5]._id, scope: 'company', data: { accountProfile: 'company' } },
    { companyId: companies[6]._id, scope: 'user', data: { accountProfile: 'solo' } },
  ];
  const db = fakeDb({ companies, subscriptions, subscriptionplans: plans, callcenter_workspace_state: states });
  const stranger = oid('ff99');
  const map = await loadAccountOffers(db, [...users, stranger]);

  assert.equal(db.calls.length, 4, `lectures : ${db.calls.join(', ')}`);
  assert.deepEqual(db.calls.sort(), ['callcenter_workspace_state', 'companies', 'subscriptionplans', 'subscriptions']);

  const at = (u) => map.get(String(u));
  assert.deepEqual([at(users[0]).offer, at(users[0]).product], ['nomad', null]);
  assert.deepEqual([at(users[1]).offer, at(users[1]).product], ['cloud', 'receptionist']);
  assert.deepEqual([at(users[2]).offer, at(users[2]).product], ['cloud', 'entreprise']);
  assert.deepEqual([at(users[3]).offer, at(users[3]).product], ['cloud', 'contact_centre']);
  assert.deepEqual([at(users[4]).offer, at(users[4]).source, at(users[4]).companyId], ['nomad', 'accountProfile', String(companies[4]._id)]);
  assert.deepEqual([at(users[5]).offer, at(users[5]).product], ['cloud', null]);
  assert.equal(at(users[6]).offer, null, 'profil de portée « user » ignoré');
  assert.equal(at(users[7]).offer, null);
  assert.equal(at(stranger).offer, null, 'compte sans société : offre inconnue');
  assert.equal(at(users[0]).companyId, String(companies[0]._id));
});

test('liste admin : page vide ou comptes sans société, une seule lecture au plus', async () => {
  const empty = fakeDb({});
  assert.equal((await loadAccountOffers(empty, [])).size, 0);
  assert.equal(empty.calls.length, 0);
  const none = fakeDb({ companies: [] });
  const map = await loadAccountOffers(none, [oid('a1')]);
  assert.equal(none.calls.length, 1);
  assert.equal(map.get(String(oid('a1'))).offer, null);
});

test('fiche admin : cas du fondateur (inscription NOMAD, type historique call-center) = NOMAD', async () => {
  const user = oid('b1');
  const company = oid('cb1');
  const db = fakeDb({
    companies: [{ _id: company, userId: user }],
    subscriptions: [],
    callcenter_workspace_state: [{ companyId: company, scope: 'company', data: { accountProfile: 'solo' } }],
  });
  const offer = await loadAccountOffer(db, String(user));
  assert.equal(offer.offer, 'nomad');
  assert.deepEqual(publicAccountOffer(offer), { offer: 'nomad', product: null, source: 'accountProfile' });
});

test('filtre « offre » de la liste', () => {
  const nomad = { accountOffer: { offer: 'nomad' } };
  const cloud = { accountOffer: { offer: 'cloud', product: 'entreprise' } };
  const unknown = { accountOffer: { offer: null } };
  assert.equal(matchesOfferFilter(nomad, 'nomad'), true);
  assert.equal(matchesOfferFilter(cloud, 'nomad'), false);
  assert.equal(matchesOfferFilter(cloud, 'cloud'), true);
  assert.equal(matchesOfferFilter(unknown, 'unknown'), true);
  assert.equal(matchesOfferFilter(nomad, 'unknown'), false);
  assert.equal(matchesOfferFilter(nomad, 'taas'), true, 'valeur invalide : pas de filtre');
  assert.deepEqual(publicAccountOffer(undefined), { offer: null, product: null, source: null });
});
