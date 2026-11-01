import assert from 'node:assert/strict';
import {
  activeEmployments, defaultCompanyId, effectiveEmployments, hasEmployment, resolveActiveCompanyId, withEmployment, withoutEmployment,
} from '../utils/employments.js';
import { agentPermissions, isCallCenterAgent } from '../constants/companyPermissions.js';
import { serializeAgentUser } from '../services/callCenterAgentService.js';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const C = '64b000000000000000000003';

// Compte existant (mono-valué) : lecture compatible, l'ancien employeur est une entrée active et le centre par défaut.
const legacy = { typeUser: 'rep', employerCompanyId: A };
assert.deepEqual(effectiveEmployments(legacy).map((e) => [e.companyId, e.status, e.legacy]), [[A, 'active', true]]);
assert.equal(defaultCompanyId(legacy), A);
assert.equal(hasEmployment(legacy, A), true);
assert.equal(hasEmployment(legacy, B), false, 'un centre absent des emplois est refusé');
assert.equal(isCallCenterAgent(legacy), true);
assert.equal(isCallCenterAgent({ typeUser: 'rep' }), false, 'rep du marché sans employeur');
assert.equal(isCallCenterAgent({ typeUser: 'company-member', employerCompanyId: A }), false);
assert.equal(hasEmployment({ typeUser: 'company-member', employerCompanyId: A }, A), false);
assert.equal(hasEmployment(null, A), false);
assert.equal(hasEmployment(legacy, ''), false);

// Une 2e invitation acceptée s'ajoute sans écraser : l'ancien centre reste le défaut, la migration est faite à l'écriture.
const t = new Date('2026-01-01');
const added = withEmployment(legacy, B, t);
assert.equal(added.employerCompanyId, A, 'le centre par défaut ne change pas');
assert.deepEqual(added.employments.map((e) => [e.companyId, e.status]), [[A, 'active'], [B, 'active']]);
const two = { typeUser: 'rep', ...added };
assert.equal(hasEmployment(two, A) && hasEmployment(two, B), true);
assert.equal(hasEmployment(two, C), false);
assert.deepEqual(activeEmployments(two).map((e) => e.companyId), [A, B]);

// Centre actif : un centre demandé n'est accepté que s'il fait partie des emplois.
assert.equal(resolveActiveCompanyId(two, B), B);
assert.equal(resolveActiveCompanyId(two, C), A, 'centre étranger : retour au centre par défaut');
assert.equal(resolveActiveCompanyId(two, undefined), A);

// Réinviter deux fois ne duplique pas.
assert.equal(withEmployment(two, B).employments.length, 2);

// Un compte sans ancien employeur : le premier emploi devient le centre par défaut.
const fresh = withEmployment({ typeUser: 'rep', employerCompanyId: null }, C, t);
assert.equal(fresh.employerCompanyId, C);

// Retirer l'agent d'UN centre ne touche pas l'autre.
const afterA = withoutEmployment(two, A);
const left = { typeUser: 'rep', ...afterA };
assert.equal(hasEmployment(left, A), false);
assert.equal(hasEmployment(left, B), true);
assert.equal(afterA.employerCompanyId, B, 'le défaut bascule sur l’emploi restant');
assert.equal(effectiveEmployments(left).find((e) => e.companyId === A).status, 'ended');
const afterB = withoutEmployment(two, B);
assert.equal(afterB.employerCompanyId, A);
assert.equal(hasEmployment({ typeUser: 'rep', ...afterB }, A), true);
// Retirer le seul emploi (ancien compte) : plus agent de personne, et l'ancien champ n'est plus lu comme actif.
const none = { typeUser: 'rep', ...withoutEmployment(legacy, A) };
assert.equal(isCallCenterAgent(none), false);
assert.equal(defaultCompanyId(none), null);
// Un emploi terminé puis ré-invité redevient actif.
assert.equal(hasEmployment({ typeUser: 'rep', ...withEmployment(left, A) }, A), true);

// Isolation de la liste d'un centre : l'agent n'expose que son identité et son emploi dans CE centre.
const shared = {
  _id: 'u1', fullName: 'Awa Diop', email: 'awa@x.test', phone: '+221700000000', typeUser: 'rep',
  employerCompanyId: A, mustChangePassword: true, invitationStatus: 'invited', invitedAt: t, isVerified: true, createdAt: t,
  employments: [{ companyId: A, status: 'active' }, { companyId: B, status: 'active' }],
};
const seenByB = serializeAgentUser(shared, 'ag1', B);
assert.equal(seenByB.employerCompanyId, B, 'le centre B ne voit jamais le centre A');
assert.equal(seenByB.invitationStatus, 'active');
assert.equal(seenByB.mustChangePassword, false, 'état du compte créé par A non exposé à B');
assert.equal(seenByB.invitedAt, null);
assert.equal(seenByB.fullName, 'Awa Diop');
assert.equal(seenByB.email, 'awa@x.test');
assert.equal(JSON.stringify(seenByB).includes(A), false, 'aucune trace de l’autre centre');
const seenByA = serializeAgentUser(shared, 'ag1', A);
assert.equal(seenByA.employerCompanyId, A);
assert.equal(seenByA.invitationStatus, 'invited');
assert.equal(JSON.stringify(seenByA).includes(B), false);

// Droits d'un agent : identiques dans chaque centre, jamais de droits de gestion.
assert.equal(agentPermissions()['gigs.edit'], false);
console.log('agentEmployments OK');
