import assert from 'node:assert/strict';
import { AGENT_CONFLICT_MESSAGE, MEMBER_CONFLICT_MESSAGE, OWNER_CONFLICT_MESSAGE, decideRoleConflict } from '../services/teamRoleDecision.js';

const none = { isOwner: false, hasMembership: false, memberInvitation: false, isAgent: false, agentInvitation: false };
// agent : refusé pour un membre (adhésion ou invitation en cours), pour le propriétaire ; permis sinon
assert.equal(decideRoleConflict('agent', none), null);
assert.equal(decideRoleConflict('agent', { ...none, hasMembership: true }), MEMBER_CONFLICT_MESSAGE);
assert.equal(decideRoleConflict('agent', { ...none, memberInvitation: true }), MEMBER_CONFLICT_MESSAGE);
assert.equal(decideRoleConflict('agent', { ...none, isOwner: true }), OWNER_CONFLICT_MESSAGE);
// membre : refusé pour un agent (compte agent du centre ou invitation d'agent), permis sinon
assert.equal(decideRoleConflict('member', none), null);
assert.equal(decideRoleConflict('member', { ...none, isAgent: true }), AGENT_CONFLICT_MESSAGE);
assert.equal(decideRoleConflict('member', { ...none, agentInvitation: true }), AGENT_CONFLICT_MESSAGE);
// un membre déjà membre n'est pas un conflit de rôle (le contrôle existant s'en charge)
assert.equal(decideRoleConflict('member', { ...none, hasMembership: true }), null);
console.log('teamRoleConflicts OK');
