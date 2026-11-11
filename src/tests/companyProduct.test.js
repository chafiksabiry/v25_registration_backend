import assert from 'node:assert/strict';
import {
  normalizePlanId,
  productFromPlanMetadata,
  resolveCompanyProduct,
  seatDecision,
  assertCanAddSeat,
  getCompanyProduct,
  NOMAD_SOLO_SEAT_MESSAGE,
} from '../services/companyProduct.js';

// Alias d'anciens paliers
assert.equal(normalizePlanId('essentiel'), 'nomad_solo');
assert.equal(normalizePlanId('equipe'), 'full_scope');
assert.equal(normalizePlanId('multi_pays'), 'multi_clients');
assert.equal(normalizePlanId('multi_clients'), 'multi_clients');
assert.equal(normalizePlanId(' Nomad-Solo '), 'nomad_solo');
for (const id of ['nomad_solo', 'accueil', 'full_scope', 'multi_clients']) assert.equal(normalizePlanId(id), id);
assert.equal(normalizePlanId('inconnu'), null);
assert.equal(normalizePlanId(undefined), null);

// Métadonnées Stripe
const meta = (tier, product = 'callcenter') => ({ harx_product: product, callcenter_tier: tier });
assert.equal(productFromPlanMetadata(meta('essentiel')), 'nomad_solo');
assert.equal(productFromPlanMetadata(meta('nomad_solo')), 'nomad_solo');
assert.equal(productFromPlanMetadata({ ' HARX_PRODUCT ': 'CallCenter', Callcenter_Tier: 'accueil' }), 'accueil');
assert.equal(productFromPlanMetadata(new Map(Object.entries(meta('equipe')))), 'full_scope');
assert.equal(productFromPlanMetadata(meta('essentiel', 'taas')), null);
assert.equal(productFromPlanMetadata({ callcenter_tier: 'essentiel' }), null);
assert.equal(productFromPlanMetadata(meta('palier_x')), null);
assert.equal(productFromPlanMetadata(null), null);

// Abonnement : actif ou en essai seulement
const plan = { metadata: meta('essentiel') };
assert.equal(resolveCompanyProduct({ status: 'active' }, plan), 'nomad_solo');
assert.equal(resolveCompanyProduct({ status: 'trialing' }, plan), 'nomad_solo');
assert.equal(resolveCompanyProduct({ status: 'canceled' }, plan), null);
assert.equal(resolveCompanyProduct({ status: 'incomplete' }, plan), null);
assert.equal(resolveCompanyProduct(null, plan), null);

// Décision de blocage
assert.deepEqual(seatDecision('nomad_solo'), { allowed: false, message: NOMAD_SOLO_SEAT_MESSAGE });
for (const p of ['accueil', 'full_scope', 'multi_clients', null]) assert.deepEqual(seatDecision(p), { allowed: true });
assert.match(NOMAD_SOLO_SEAT_MESSAGE, /Nomad Solo est prévu pour un seul utilisateur/);

// Lecture en base (faux db)
function fakeDb(subscription, planDoc) {
  return {
    collection: (name) => ({
      find: () => ({ sort: () => ({ limit: () => ({ next: async () => subscription }) }) }),
      findOne: async () => (name === 'subscriptionplans' ? planDoc : null),
    }),
  };
}
const planId = '64b000000000000000000001';
const company = '64b0000000000000000000c1';
assert.equal(await getCompanyProduct(company, fakeDb({ status: 'active', planId }, plan)), 'nomad_solo');
await assert.rejects(
  () => assertCanAddSeat(company, fakeDb({ status: 'trialing', planId }, plan)),
  (e) => e.statusCode === 403 && e.message === NOMAD_SOLO_SEAT_MESSAGE
);
await assertCanAddSeat(company, fakeDb({ status: 'active', planId }, { metadata: meta('accueil') }));
await assertCanAddSeat(company, fakeDb(null, null)); // sans abonnement : pas de blocage
await assertCanAddSeat(company, fakeDb({ status: 'active', planId }, { metadata: meta('???') })); // palier inconnu
const broken = { collection: () => { throw new Error('boom'); } };
const origError = console.error;
console.error = () => {};
await assertCanAddSeat(company, broken); // erreur de lecture : pas de blocage
console.error = origError;

console.log('companyProduct OK');
