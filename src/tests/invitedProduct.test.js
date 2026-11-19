import assert from 'node:assert/strict';
import { resolveInviteProduct, tagProductIfMissing, tagInviteAccounts } from '../utils/invitedProduct.js';

// Faux modèle User : mémorise les updateOne (filtre + mise à jour)
const fakeModel = (docs = {}) => {
  const calls = [];
  return {
    calls,
    async updateOne(filter, update) {
      calls.push({ filter, update });
      const d = docs[String(filter._id)];
      const unset = d && (d.product == null);
      if (d && unset) d.product = update.$set.product;
      return { modifiedCount: d && unset ? 1 : 0 };
    },
  };
};
const finder = (users) => async (id) => users[String(id)] || null;

// 1. Produit de l'inviteur d'abord
assert.equal(await resolveInviteProduct({ caller: { _id: 'o', product: 'callcentre' }, company: { userId: 'o' }, findUserById: finder({}) }), 'callcentre');

// 2. Inviteur sans produit (administrateur) : produit du propriétaire
assert.equal(await resolveInviteProduct({ caller: { _id: 'm', product: null }, company: { userId: 'o' }, findUserById: finder({ o: { _id: 'o', product: 'callcentre' } }) }), 'callcentre');

// 3. Propriétaire jamais étiqueté (cas de la recette) : l'entreprise Call Centre donne callcentre
assert.equal(await resolveInviteProduct({ caller: { _id: 'o', product: null }, company: { userId: 'o' }, findUserById: finder({ o: { _id: 'o' } }) }), 'callcentre');
assert.equal(await resolveInviteProduct({ caller: { _id: 'm' }, company: { userId: 'o' }, findUserById: finder({}) }), 'callcentre');

// 4. Valeur inconnue ou injectée : ignorée
assert.equal(await resolveInviteProduct({ caller: { _id: 'o', product: { $ne: null } }, company: { userId: 'o' }, findUserById: finder({}) }), 'callcentre');

// 5. Lecture du propriétaire en échec : pas d'exception, repli callcentre
assert.equal(await resolveInviteProduct({ caller: { _id: 'm' }, company: { userId: 'o' }, findUserById: async () => { throw new Error('boom'); } }), 'callcentre');

// 6. Jamais d'écrasement : le filtre exige un produit absent ou nul
const docs = { a: { product: null }, b: { product: 'autre' }, c: {} };
const model = fakeModel(docs);
assert.equal(await tagProductIfMissing(model, 'a', 'callcentre'), true);
assert.equal(await tagProductIfMissing(model, 'b', 'callcentre'), false);
assert.equal(docs.b.product, 'autre');
assert.equal(await tagProductIfMissing(model, 'c', 'callcentre'), true);
const f = model.calls[0].filter;
assert.deepEqual(f.$or, [{ product: null }, { product: { $exists: false } }]);
assert.deepEqual(model.calls[0].update, { $set: { product: 'callcentre' } });

// 7. Produit absent ou invalide : aucune écriture
const m2 = fakeModel({});
assert.equal(await tagProductIfMissing(m2, 'a', null), false);
assert.equal(await tagProductIfMissing(m2, 'a', 'admin'), false);
assert.equal(await tagProductIfMissing(m2, null, 'callcentre'), false);
assert.equal(m2.calls.length, 0);

// 8. Étiquetage du propriétaire, de l'inviteur et de l'invité ; un échec n'interrompt pas l'invitation
const m3 = fakeModel({ o: { product: null }, m: { product: null }, i: { product: null } });
await tagInviteAccounts(m3, ['o', 'm', 'm', 'i', null], 'callcentre');
assert.deepEqual(m3.calls.map((c) => String(c.filter._id)), ['o', 'm', 'i']);
const failing = { async updateOne() { throw new Error('db'); } };
await tagInviteAccounts(failing, ['o'], 'callcentre'); // ne lève pas
console.log('invitedProduct OK');

// 9. Garde de câblage : chaque flux d'invitation (création, réinvitation, compte existant) porte le produit
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../services/${f}`, import.meta.url), 'utf8');
const members = src('companyMemberService.js');
const agents = src('callCenterAgentService.js');
// Membre : la variable s'appelle accountProduct (le service a aussi `product`, produit d'accès de l'entreprise).
assert.match(members, /typeUser: 'company-member',\s+product: accountProduct,/, 'membre invité créé avec le produit');
assert.match(agents, /typeUser: 'rep',\s+product,/, 'agent invité créé avec le produit');
assert.match(members, /if \(!user\.product\) user\.product = accountProduct;/, 'réinvitation de membre : produit posé si absent');
assert.match(agents, /if \(!user\.product\) user\.product = product;/, 'renvoi d’invitation d’agent : produit posé si absent');
assert.equal((members.match(/tagInviteAccounts\(User, \[existingUser\._id\], accountProduct\)/g) || []).length, 1, 'membre : compte existant étiqueté');
assert.equal((agents.match(/tagInviteAccounts\(User, \[existing\._id\], product\)/g) || []).length, 1, 'agent : compte existant étiqueté');
assert.equal((agents.match(/tagInviteAccounts\(User, \[user\._id\], product\)/g) || []).length, 1, 'agent : relance d’un compte existant étiquetée');
assert.equal((members.match(/await inviteProduct\(caller, company\)/g) || []).length, 2, 'membre : invitation et réinvitation');
console.log('invitedProduct (câblage) OK');
