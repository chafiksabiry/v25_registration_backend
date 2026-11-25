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
  companiesWithMembersPipeline,
  otherMembersOf,
  applySignupOffer,
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
      // Lecture groupée des sociétés (companiesWithMembersPipeline) : $match, $lookup (localField / foreignField, tableaux
      // compris, comme MongoDB) et $project de chemins « $a.b ». Une seule lecture comptée.
      aggregate: (pipeline) => {
        calls.push(name);
        const path = (doc, p) => p.split('.').reduce((v, k) => (Array.isArray(v) ? v.flatMap((x) => (x?.[k] === undefined ? [] : [x[k]])) : v?.[k]), doc);
        let rows = [...(data[name] || [])];
        for (const stage of pipeline) {
          if (stage.$match) rows = rows.filter((doc) => match(name, stage.$match, doc));
          if (stage.$lookup) {
            const { from, localField, foreignField, as } = stage.$lookup;
            rows = rows.map((doc) => ({
              ...doc,
              [as]: (data[from] || []).filter((o) => {
                const v = path(o, foreignField);
                const local = path(doc, localField);
                return Array.isArray(v) ? v.some((x) => x instanceof mongoose.Types.ObjectId && local instanceof mongoose.Types.ObjectId && x.equals(local)) : v instanceof mongoose.Types.ObjectId && local instanceof mongoose.Types.ObjectId && v.equals(local);
              }),
            }));
          }
          if (stage.$project) {
            rows = rows.map((doc) => Object.fromEntries(Object.entries(stage.$project).map(([k, v]) => [k, typeof v === 'string' ? path(doc, v.slice(1)) : doc[k]])));
          }
        }
        return { toArray: async () => rows };
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

// --- Règle du fondateur : « si avec d'autres membres ça ne peut pas être NOMAD » (même critère que COMPANY_HAS_MEMBERS). ---
test('resolveAccountOfferDetail : avec d’autres membres, jamais NOMAD (palier nomad_solo, ancien « essentiel », profil solo)', async () => {
  const states = (rows) => async () => rows;
  const legacy = productFromPlanMetadata(meta('essentiel'));
  assert.equal(legacy, 'nomad_solo', 'ancien palier « essentiel » ramené à nomad_solo');
  for (const tier of ['nomad_solo', legacy]) {
    const d = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => tier, workspaceStates: states([]), hasOtherMembers: true });
    assert.deepEqual(d, { offer: 'cloud', product: null, source: 'subscription', tier: 'nomad_solo', accountProfile: null, membersOverride: true });
  }
  const solo = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: { accountProfile: 'solo' } }]), hasOtherMembers: true });
  assert.deepEqual(solo, { offer: 'cloud', product: null, source: 'accountProfile', tier: null, accountProfile: 'solo', membersOverride: true });
  // Palier CLOUD d'une autre société du compte : CLOUD + produit, même si la première est en nomad_solo.
  const tiers = { c1: 'nomad_solo', c2: 'multi_clients' };
  const mixed = await resolveAccountOfferDetail({ companyIds: ['c1', 'c2'], lastKnownTier: async (id) => tiers[id], workspaceStates: states([]), hasOtherMembers: true });
  assert.deepEqual([mixed.offer, mixed.product, mixed.membersOverride], ['cloud', 'contact_centre', undefined]);
  // Seul (sans autres membres) : NOMAD inchangé.
  const alone = await resolveAccountOfferDetail({ companyIds: ['c1', 'c2'], lastKnownTier: async (id) => tiers[id], workspaceStates: states([]) });
  assert.deepEqual([alone.offer, alone.product], ['nomad', null]);
  // Sans aucune donnée d'offre, les membres seuls ne suffisent pas : offre inconnue.
  assert.equal((await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([]), hasOtherMembers: true })).offer, null);
});

test('liste admin : comptes « cc » avec d’autres membres jamais NOMAD, comptes seuls inchangés, toujours 4 lectures', async () => {
  const owners = Array.from({ length: 8 }, (_, i) => oid(`d${i}`));
  const companies = owners.map((u, i) => ({ _id: oid(`e${i}`), userId: u }));
  const plans = [
    { _id: oid('f1'), metadata: meta('nomad_solo') },
    { _id: oid('f2'), metadata: meta('essentiel') },
    { _id: oid('f3'), metadata: meta('full_scope') },
  ];
  const sub = (i, plan) => ({ companyId: companies[i]._id, status: 'active', planId: plan._id, createdAt: new Date('2026-10-29') });
  const subscriptions = [sub(0, plans[0]), sub(1, plans[1]), sub(3, plans[2]), sub(5, plans[0]), sub(7, plans[1])];
  const states = [
    { companyId: companies[2]._id, scope: 'company', data: { accountProfile: 'solo' } },
    { companyId: companies[6]._id, scope: 'company', data: { accountProfile: 'solo' } },
  ];
  // Membres (critères de otherMembersCount) : agent par employerCompanyId, agent par employments, accès CompanyMembership.
  const users = [
    { _id: oid('aa0'), employerCompanyId: companies[0]._id },
    { _id: oid('aa1'), employments: [{ companyId: companies[1]._id }] },
    { _id: oid('aa3'), employerCompanyId: companies[3]._id },
    // Le titulaire rattaché à sa propre société ne compte pas comme « autre membre ».
    { _id: owners[5], employerCompanyId: companies[5]._id },
  ];
  const companymemberships = [
    { companyId: companies[2]._id, userId: oid('bb2') },
    { companyId: companies[6]._id, userId: owners[6] },
    { companyId: companies[7]._id, userId: owners[7] },
  ];
  const db = fakeDb({ companies, subscriptions, subscriptionplans: plans, callcenter_workspace_state: states, users, companymemberships });
  const map = await loadAccountOffers(db, owners);

  assert.equal(db.calls.length, 4, `lectures : ${db.calls.join(', ')}`);
  const at = (i) => map.get(String(owners[i]));
  // Avec d'autres membres : CLOUD.
  assert.deepEqual([at(0).offer, at(0).product, at(0).membersOverride], ['cloud', null, true], 'nomad_solo + agent');
  assert.deepEqual([at(1).offer, at(1).product, at(1).membersOverride], ['cloud', null, true], 'ancien essentiel + agent (employments)');
  assert.deepEqual([at(2).offer, at(2).source, at(2).membersOverride], ['cloud', 'accountProfile', true], 'profil solo + membre');
  assert.deepEqual([at(3).offer, at(3).product], ['cloud', 'entreprise'], 'palier CLOUD + agent : produit gardé');
  assert.deepEqual(publicAccountOffer(at(0)), { offer: 'cloud', product: null, source: 'subscription' });
  // Seuls (titulaire seulement) : NOMAD inchangé.
  assert.deepEqual([at(5).offer, at(5).membersOverride], ['nomad', undefined], 'titulaire agent de sa propre société');
  assert.deepEqual([at(6).offer, at(6).source, at(6).companyId], ['nomad', 'accountProfile', String(companies[6]._id)]);
  assert.deepEqual([at(7).offer, at(7).companyId], ['nomad', String(companies[7]._id)]);
  assert.equal(at(4).offer, null);
});

test('lecture des sociétés : mêmes critères de membres que le refus COMPANY_HAS_MEMBERS', () => {
  const pipeline = companiesWithMembersPipeline([String(oid('d1'))]);
  const lookups = pipeline.filter((s) => s.$lookup).map((s) => [s.$lookup.from, s.$lookup.foreignField]);
  assert.deepEqual(lookups, [['users', 'employerCompanyId'], ['users', 'employments.companyId'], ['companymemberships', 'companyId']]);
  assert.equal(otherMembersOf({ userId: 'o', employerAgentIds: ['a', 'o'], employedAgentIds: ['a', 'b'], memberUserIds: ['o', 'm'] }), 3);
  assert.equal(otherMembersOf({ userId: 'o', employerAgentIds: ['o'], employedAgentIds: [], memberUserIds: ['o'] }), 0);
});

test('parcours d’entrée : signup.offer prime sur la déduction, jamais NOMAD avec d’autres membres', async () => {
  const states = (rows) => async () => rows;
  // Abonnement Entreprise, mais inscription par l'adresse NOMAD : le parcours fait foi.
  const d1 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'full_scope', workspaceStates: states([]), signup: { offer: 'nomad' } });
  assert.deepEqual([d1.offer, d1.product, d1.source], ['nomad', null, 'signup']);
  // CLOUD sans produit au parcours : produit de l'abonnement ; CLOUD Receptionist : produit du parcours.
  const d2 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'full_scope', workspaceStates: states([]), signup: { offer: 'cloud', product: null } });
  assert.deepEqual([d2.offer, d2.product, d2.source], ['cloud', 'entreprise', 'signup']);
  const d3 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'nomad_solo', workspaceStates: states([]), signup: { offer: 'cloud', product: 'receptionist' } });
  assert.deepEqual([d3.offer, d3.product], ['cloud', 'receptionist']);
  // Règle des membres : NOMAD au parcours + autres membres -> déduction (CLOUD), jamais NOMAD.
  const d4 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'nomad_solo', workspaceStates: states([]), hasOtherMembers: true, signup: { offer: 'nomad' } });
  assert.deepEqual([d4.offer, d4.membersOverride], ['cloud', true]);
  assert.deepEqual(applySignupOffer({ offer: null, product: null, source: null, tier: null, accountProfile: null }, { offer: 'nomad' }, { hasOtherMembers: true }).offer, 'cloud');
  // Valeur hors liste ou absente : déduction inchangée.
  const d5 = await resolveAccountOfferDetail({ companyIds: ['c1'], lastKnownTier: async () => 'accueil', workspaceStates: states([]), signup: { offer: 'admin' } });
  assert.deepEqual([d5.offer, d5.product, d5.source], ['cloud', 'receptionist', 'subscription']);
  const d6 = await resolveAccountOfferDetail({ companyIds: [], lastKnownTier: async () => null, workspaceStates: states([]), signup: { offer: 'taas', product: 'receptionist' } });
  assert.deepEqual([d6.offer, d6.product, d6.source], ['taas', null, 'signup']);
  // E-mail de suppression : même règle (resolveAccountOffer).
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => 'accueil', workspaceStates: states([]), signup: { offer: 'nomad' } }), 'nomad');
});

test('liste admin : parcours d’entrée passé par l’appelant, toujours 4 lectures au plus', async () => {
  const owners = [oid('d10'), oid('d11'), oid('d12'), oid('d13')];
  const companies = [{ _id: oid('e10'), userId: owners[0] }, { _id: oid('e11'), userId: owners[1] }, { _id: oid('e12'), userId: owners[2] }];
  const plans = [{ _id: oid('f10'), metadata: meta('full_scope') }];
  const subscriptions = [{ companyId: companies[0]._id, status: 'active', planId: plans[0]._id, createdAt: new Date('2026-11-01') }];
  const users = [{ _id: oid('aa12'), employerCompanyId: companies[2]._id }];
  const db = fakeDb({ companies, subscriptions, subscriptionplans: plans, callcenter_workspace_state: [], users, companymemberships: [] });
  const signups = new Map([
    [String(owners[0]), { offer: 'nomad' }],
    [String(owners[1]), { offer: 'cloud', product: 'receptionist' }],
    [String(owners[2]), { offer: 'nomad' }],
    [String(owners[3]), { offer: 'nomad' }],
  ]);
  const map = await loadAccountOffers(db, owners, { signups });
  assert.ok(db.calls.length <= 4, `lectures : ${db.calls.join(', ')}`);
  const at = (i) => map.get(String(owners[i]));
  assert.deepEqual([at(0).offer, at(0).source, at(0).companyId], ['nomad', 'signup', String(companies[0]._id)]);
  assert.deepEqual([at(1).offer, at(1).product, at(1).companyId], ['cloud', 'receptionist', String(companies[1]._id)]);
  assert.deepEqual([at(2).offer, at(2).membersOverride], ['cloud', true], 'NOMAD au parcours, mais un agent : jamais NOMAD');
  assert.deepEqual([at(3).offer, at(3).source, at(3).companyId], ['nomad', 'signup', null], 'sans société : le parcours suffit');
  // Sans parcours passé : comportement d'avant.
  const before = await loadAccountOffers(fakeDb({ companies, subscriptions, subscriptionplans: plans, callcenter_workspace_state: [], users, companymemberships: [] }), owners);
  assert.deepEqual([before.get(String(owners[0])).offer, before.get(String(owners[0])).source], ['cloud', 'subscription']);
  assert.equal(before.get(String(owners[3])).offer, null);
});
