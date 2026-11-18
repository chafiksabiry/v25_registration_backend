import assert from 'node:assert/strict';
import {
  LISTEN_KEY,
  agentPermissions,
  effectiveMemberPermissions,
  explicitListenRequested,
  listenIsOptIn,
  nextListenGrantedAt,
  presetPermissions,
} from '../constants/companyPermissions.js';

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
assert.equal(effectiveMemberPermissions({ preset: 'custom', permissions: {}, listenGrantedAt: new Date() }, 'accueil')[LISTEN_KEY], false, 'accord sans la case : pas d’écoute');

// Date d'accord enregistrée.
const now = new Date('2026-11-18T10:00:00Z');
const before = new Date('2026-01-01T00:00:00Z');
assert.equal(explicitListenRequested({ [LISTEN_KEY]: true }), true);
assert.equal(explicitListenRequested({ [LISTEN_KEY]: false }), false);
assert.equal(explicitListenRequested(undefined), false);
assert.equal(nextListenGrantedAt({ rights: { [LISTEN_KEY]: true }, preset: 'custom', requested: { [LISTEN_KEY]: true }, now }), now, 'case cochée');
assert.equal(nextListenGrantedAt({ rights: { [LISTEN_KEY]: true }, preset: 'custom', requested: { [LISTEN_KEY]: true }, previous: before, now }), before, 'accord conservé');
assert.equal(nextListenGrantedAt({ rights: { [LISTEN_KEY]: false }, preset: 'custom', requested: {}, previous: before, now }), null, 'retirée');
assert.equal(nextListenGrantedAt({ rights: { [LISTEN_KEY]: true }, preset: 'operator', requested: undefined, now }), null, 'profil par défaut : pas un accord');
assert.equal(nextListenGrantedAt({ rights: { [LISTEN_KEY]: true }, preset: 'admin', requested: undefined, now }), now, 'admin');

console.log('accueilListen OK');
