import assert from 'node:assert/strict';
import {
  LISTEN_KEY,
  agentPermissions,
  effectiveMemberPermissions,
  listenIsOptIn,
  presetPermissions,
  productForWrite,
  resolveMemberListen,
} from '../constants/companyPermissions.js';
import { assertListenGrantAllowed } from '../services/companyMemberService.js';
import { clearProductAccessCache, getCompanyProductForAccess, getLastKnownCompanyProduct } from '../services/companyProduct.js';

// Offre Accueil / Secrétariat : personne n'écoute les enregistrements par défaut ; le titulaire accorde l'écoute à qui il veut.
assert.equal(listenIsOptIn('accueil'), true);
assert.equal(listenIsOptIn('unknown'), true, 'palier illisible : écoute sur accord explicite');
for (const p of ['nomad_solo', 'full_scope', 'multi_clients', null]) assert.equal(listenIsOptIn(p), false, `${p} inchangé`);

// Agents (secrétaires).
assert.equal(agentPermissions()[LISTEN_KEY], true, 'sans option : droits historiques');
assert.equal(agentPermissions({ product: 'full_scope' })[LISTEN_KEY], true, 'autres offres : écoute par défaut');
assert.equal(agentPermissions({ product: 'accueil' })[LISTEN_KEY], false, 'Accueil : pas d’écoute par défaut');
assert.equal(agentPermissions({ product: 'accueil', listen: true })[LISTEN_KEY], true, 'Accueil : accordée par le titulaire');
assert.equal(agentPermissions({ product: 'full_scope', listen: false })[LISTEN_KEY], false, 'retirée par le titulaire');
assert.equal(agentPermissions({ product: 'accueil' })['calls.view'], true, 'la secrétaire voit toujours ses appels');

// Profils par défaut des membres.
assert.equal(presetPermissions('operator')[LISTEN_KEY], true);
assert.equal(presetPermissions('operator', { product: 'full_scope' })[LISTEN_KEY], true);
assert.equal(presetPermissions('operator', { product: 'accueil' })[LISTEN_KEY], false, 'Accueil : operator sans écoute');
assert.equal(presetPermissions('operator', { product: 'accueil' })['calls.validate'], true, 'le reste du profil ne change pas');
assert.equal(presetPermissions('admin', { product: 'accueil' })[LISTEN_KEY], true, 'admin : tous les droits, accord explicite');
assert.equal(presetPermissions('readonly', { product: 'accueil' })[LISTEN_KEY], false);

// Droits réels d'un membre.
const legacy = { preset: 'operator', permissions: presetPermissions('operator') };
assert.equal(effectiveMemberPermissions(legacy, 'accueil')[LISTEN_KEY], false, 'ancien membre Accueil : nouveau défaut, sans écoute');
assert.equal(effectiveMemberPermissions(legacy, 'full_scope')[LISTEN_KEY], true, 'autres offres inchangées');
assert.equal(effectiveMemberPermissions({ ...legacy, preset: 'custom', listenGrantedAt: new Date() }, 'accueil')[LISTEN_KEY], true, 'accordée');
assert.equal(effectiveMemberPermissions({ preset: 'admin', permissions: presetPermissions('admin') }, 'accueil')[LISTEN_KEY], true);
assert.equal(effectiveMemberPermissions({ preset: 'custom', permissions: {}, listenGrantedAt: new Date() }, 'accueil')[LISTEN_KEY], true, 'accord sans la case : écoute (l’accord suffit)');

// Décision d'écoute à l'écriture : intention explicite du titulaire prouvé seulement.
const now = new Date('2026-11-18T10:00:00Z');
const before = new Date('2026-01-01T00:00:00Z');
const operatorFull = presetPermissions('operator'); // jeu complet envoyé par un ancien écran, calls.listen: true
let r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: true, now });
assert.equal(r.rights[LISTEN_KEY], false, 'calls.listen du jeu complet : pas un accord, même du titulaire');
assert.equal(r.listenGrantedAt, null);
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: false, listenGrant: true, now });
assert.equal(r.rights[LISTEN_KEY], false, 'membre (members.edit, auto-attribution ou admin non titulaire) : accord ignoré');
assert.equal(r.listenGrantedAt, null);
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'admin', previousPreset: 'admin', ownerProven: false, listenGrant: false, now });
assert.equal(r.rights[LISTEN_KEY], true, 'non-titulaire : ne retire pas non plus');
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: true, listenGrant: true, now });
assert.equal(r.rights[LISTEN_KEY], true, 'titulaire prouvé : accorde');
assert.equal(r.listenGrantedAt, now);
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: true, listenGrant: true, previousGrantedAt: before, now });
assert.equal(r.listenGrantedAt, before, 'accord conservé');
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: false, previousGrantedAt: before, now });
assert.equal(r.rights[LISTEN_KEY], true, 'modification par un membre : accord existant conservé');
r = resolveMemberListen({ product: 'accueil', rights: operatorFull, preset: 'custom', ownerProven: true, listenGrant: false, previousGrantedAt: before, now });
assert.equal(r.rights[LISTEN_KEY], false, 'titulaire : retire');
assert.equal(r.listenGrantedAt, null);
r = resolveMemberListen({ product: 'accueil', rights: presetPermissions('admin'), preset: 'admin', ownerProven: true, listenGrant: false, now });
assert.equal(r.rights[LISTEN_KEY], false, 'titulaire : retire l’écoute à un admin');
assert.equal(effectiveMemberPermissions({ preset: 'admin', permissions: presetPermissions('admin'), listenRevokedAt: now }, 'accueil')[LISTEN_KEY], false);
// Membre non admin : l'accord suffit (calls.listen enregistré ou non), sauf retrait postérieur.
assert.equal(effectiveMemberPermissions({ preset: 'custom', permissions: { 'calls.view': true }, listenGrantedAt: before }, 'accueil')[LISTEN_KEY], true, 'accord seul suffit');
assert.equal(effectiveMemberPermissions({ preset: 'custom', permissions: {}, listenGrantedAt: before, listenRevokedAt: now }, 'accueil')[LISTEN_KEY], false, 'retrait postérieur');
assert.equal(effectiveMemberPermissions({ preset: 'custom', permissions: {}, listenGrantedAt: now, listenRevokedAt: before }, 'accueil')[LISTEN_KEY], true, 'accord postérieur au retrait');
assert.equal(effectiveMemberPermissions({ preset: 'admin', permissions: {}, listenGrantedAt: now, listenRevokedAt: before }, 'accueil')[LISTEN_KEY], true, 'admin ré-autorisé');

// Profil admin attribué par un non-titulaire : l'écoute ne suit pas (attribution elle-même permise).
const adminFull = presetPermissions('admin');
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], false, 'invitation admin par un non-titulaire : sans écoute');
assert.equal(r.listenRevokedAt, now);
assert.equal(effectiveMemberPermissions({ preset: 'admin', permissions: r.rights, listenRevokedAt: r.listenRevokedAt }, 'accueil')[LISTEN_KEY], false);
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', previousPreset: 'custom', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], false, 'passage en admin par un non-titulaire : sans écoute');
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', previousPreset: 'custom', ownerProven: false, previousGrantedAt: before, now });
assert.equal(r.rights[LISTEN_KEY], true, 'passage en admin : accord existant conservé');
assert.equal(r.listenRevokedAt, null);
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', previousPreset: 'admin', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], true, 'admin déjà en place, modifié par un non-titulaire : inchangé');
r = resolveMemberListen({ product: 'unknown', rights: adminFull, preset: 'admin', ownerProven: false, now });
assert.equal(r.listenRevokedAt, now, 'palier illisible : retrait noté, appliqué à la lecture si Accueil');
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', previousPreset: 'custom', ownerProven: true, now });
assert.equal(r.rights[LISTEN_KEY], true, 'titulaire : admin écoute par défaut');
r = resolveMemberListen({ product: 'accueil', rights: adminFull, preset: 'admin', previousPreset: 'custom', ownerProven: false, listenGrant: true, now });
assert.equal(r.rights[LISTEN_KEY], false, 'non-titulaire : listenGrant ignoré');
r = resolveMemberListen({ product: 'full_scope', rights: adminFull, preset: 'admin', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], true, 'autres offres : admin inchangé');
r = resolveMemberListen({ product: 'full_scope', rights: operatorFull, preset: 'custom', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], true, 'autres offres : droits génériques inchangés');
r = resolveMemberListen({ product: 'unknown', rights: operatorFull, preset: 'operator', ownerProven: false, now });
assert.equal(r.rights[LISTEN_KEY], true, 'palier illisible : rien de figé à l’écriture');
assert.equal(effectiveMemberPermissions({ preset: 'operator', permissions: r.rights }, 'unknown')[LISTEN_KEY], false, '… la règle s’applique à la lecture');
assert.equal(productForWrite('unknown'), null);
assert.equal(presetPermissions('operator', { product: productForWrite('unknown') })[LISTEN_KEY], true);

// Palier pour l'accès : dernier palier connu, quel que soit le statut ; cache 60 s ; erreur = 'unknown'.
const plans = {
  p_acc: { _id: 'p_acc', metadata: { harx_product: 'callcenter', callcenter_tier: 'accueil' } },
  p_full: { _id: 'p_full', metadata: { harx_product: 'callcenter', callcenter_tier: 'full_scope' } },
  p_x: { _id: 'p_x', metadata: { harx_product: 'taas' } },
};
let reads = 0;
// subs : du plus récent au plus ancien.
const fakeDb = (subs) => ({
  collection: (name) => name === 'subscriptions'
    ? {
        find: (q) => {
          const rows = q?.status?.$in ? subs.filter((x) => q.status.$in.includes(x.status)) : subs;
          return { sort: () => ({ limit: (n) => ({
            toArray: async () => { reads += 1; return rows.slice(0, n); },
            next: async () => { reads += 1; return rows[0] || null; },
          }) }) };
        },
      }
    : { findOne: async ({ _id }) => plans[_id] || null },
});
assert.equal(await getLastKnownCompanyProduct('c1', fakeDb([{ status: 'past_due', planId: 'p_acc' }])), 'accueil', 'impayé : palier gardé');
assert.equal(await getLastKnownCompanyProduct('c1', fakeDb([{ status: 'canceled', planId: 'p_x' }, { status: 'canceled', planId: 'p_acc' }])), 'accueil', 'annulé, plan non Call Centre ignoré');
assert.equal(await getLastKnownCompanyProduct('c1', fakeDb([])), null, 'jamais d’abonnement');
assert.equal(
  await getLastKnownCompanyProduct('c1', fakeDb([{ status: 'incomplete', planId: 'p_full' }, { status: 'active', planId: 'p_acc' }])),
  'accueil',
  'abonnement actif d’abord : Accueil actif l’emporte sur un Full Scope incomplete plus récent'
);
assert.equal(
  await getLastKnownCompanyProduct('c1', fakeDb([{ status: 'trialing', planId: 'p_full' }, { status: 'active', planId: 'p_acc' }])),
  'full_scope',
  'essai le plus récent compte comme actif'
);
assert.equal(
  await getLastKnownCompanyProduct('c1', fakeDb([{ status: 'canceled', planId: 'p_full' }, { status: 'unpaid', planId: 'p_acc' }])),
  'full_scope',
  'aucun actif : dernier palier connu, tous statuts'
);
clearProductAccessCache();
reads = 0;
const db1 = fakeDb([{ status: 'unpaid', planId: 'p_acc' }]);
assert.equal(await getCompanyProductForAccess('c2', db1, 1000), 'accueil');
assert.equal(await getCompanyProductForAccess('c2', db1, 30000), 'accueil');
assert.equal(reads, 2, 'cache 60 s (une lecture : actif puis tous statuts)');
await getCompanyProductForAccess('c2', db1, 62000);
assert.equal(reads, 4, 'cache expiré');
const broken = { collection: () => { throw new Error('panne'); } };
const origErr = console.error; console.error = () => {};
assert.equal(await getCompanyProductForAccess('c3', broken, 1000), 'unknown');
console.error = origErr;

// listenGrant sans titulaire prouvé : erreur explicite (jamais ignoré en silence).
const company = { _id: 'co1', userId: 'owner1' };
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e; } };
assert.equal(thrown(() => assertListenGrantAllowed(company, 'owner1', 'owner1', true)), null, 'titulaire prouvé : permis');
assert.equal(thrown(() => assertListenGrantAllowed(company, 'm1', null, undefined)), null, 'sans listenGrant : rien');
let e = thrown(() => assertListenGrantAllowed(company, 'owner1', null, true));
assert.equal(e?.statusCode, 401); assert.equal(e?.code, 'LISTEN_REAUTH_REQUIRED');
e = thrown(() => assertListenGrantAllowed(company, 'm1', 'm1', false));
assert.equal(e?.statusCode, 403); assert.equal(e?.code, 'LISTEN_OWNER_ONLY');
e = thrown(() => assertListenGrantAllowed(company, 'owner1', 'owner1', 'yes'));
assert.equal(e?.statusCode, 400);

console.log('accueilListen OK');
