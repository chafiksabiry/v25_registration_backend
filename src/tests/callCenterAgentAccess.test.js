import assert from 'node:assert/strict';
import { agentPermissions, allPermissionKeys, isCallCenterAgent } from '../constants/companyPermissions.js';

assert.equal(isCallCenterAgent({ typeUser: 'rep', employerCompanyId: '64b000000000000000000001' }), true);
assert.equal(isCallCenterAgent({ typeUser: 'rep', employerCompanyId: null }), false, 'rep du marché, sans employeur');
assert.equal(isCallCenterAgent({ typeUser: 'company-member', employerCompanyId: '64b000000000000000000001' }), false);
assert.equal(isCallCenterAgent(null), false);

const p = agentPermissions();
const granted = Object.keys(p).filter((k) => p[k]).sort();
assert.deepEqual(granted, ['calls.listen', 'calls.view', 'gigs.view', 'training.view'], 'un agent prend ses appels, se forme et voit son planning');
for (const k of allPermissionKeys()) {
  if (/^(billing|members|settings|telephony|scripts|knowledge|leads|matching)\./.test(k)) assert.equal(p[k], false, `${k} refusé à un agent`);
}
assert.equal(p['gigs.create'], false);
assert.equal(p['gigs.activate'], false);
console.log('callCenterAgentAccess OK');
