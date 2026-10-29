import assert from 'node:assert/strict';
import { normalizeWorkspaceInput } from '../services/callCenterWorkspaceStateValidation.js';

const ok = normalizeWorkspaceInput({
  company: {
    queues: [{ id: 'q1', name: '  SECRETARIAT ', direction: 'inbound', strategy: 'round_robin', createdAt: '2026-10-29T10:00:00Z', greeting: 'Bonjour', extra: 'ignoré' }, { id: '', name: 'sans id' }],
    testedLines: { '+33219122061': { at: '2026-10-29T10:45:00Z', to: '+33623984708' }, 'abc': { at: 'x' } },
    inboundTestedLines: { '+33219122061': { at: '2026-10-29T10:50:00Z', from: '+33612345678' } },
    onboarding: { done: true, currentStep: 'test', timings: { company: { startedAt: 1, completedAt: 2, activeMs: 5 }, inconnu: { startedAt: 1 } } },
  },
  user: { academy: { done: ['m1', 3, 'm2'], welcomeDismissed: 1 }, activeOperationId: '6ae32645b98a1af2bcb10953' },
});
assert.deepEqual(ok.errors, []);
assert.equal(ok.value.company.queues.length, 1, 'file sans identifiant écartée');
assert.equal(ok.value.company.queues[0].name, 'SECRETARIAT');
assert.equal(ok.value.company.queues[0].strategy, 'round_robin');
assert.equal(ok.value.company.queues[0].extra, undefined, 'champs inconnus écartés');
assert.deepEqual(Object.keys(ok.value.company.testedLines), ['+33219122061'], 'clé qui n’est pas un numéro écartée');
assert.equal(ok.value.company.testedLines['+33219122061'].to, '+33623984708');
assert.equal(ok.value.company.inboundTestedLines['+33219122061'].from, '+33612345678');
assert.equal(ok.value.company.onboarding.done, true);
assert.deepEqual(Object.keys(ok.value.company.onboarding.timings), ['company'], 'étape inconnue écartée');
assert.deepEqual(ok.value.user.academy, { done: ['m1', 'm2'], welcomeDismissed: true });
assert.equal(ok.value.user.activeOperationId, '6ae32645b98a1af2bcb10953');

// identité du centre et appel de test
const prof = normalizeWorkspaceInput({ company: { profile: { name: ' Nipux Experts ', siren: '123456789', representativeEmail: 'a@b.fr', kybStatus: 'submitted', country: 'fr', address: { street: '1 rue X', postalCode: '75001', city: 'Paris' }, documents: [{ name: 'kbis.pdf', size: 1200, kind: 'kbis', contenu: 'ignoré' }, { name: '' }] }, testCallOk: 1, testCall: { at: 'x', from: '+33219122061', to: '+33623984708' } } });
assert.deepEqual(prof.errors, []);
assert.equal(prof.value.company.profile.name, 'Nipux Experts');
assert.equal(prof.value.company.profile.country, 'FR');
assert.deepEqual(prof.value.company.profile.documents, [{ name: 'kbis.pdf', size: 1200, kind: 'kbis' }]);
assert.equal(prof.value.company.testCallOk, true);
assert.equal(prof.value.company.testCall.to, '+33623984708');
assert.equal(normalizeWorkspaceInput({ company: { profile: 'x' } }).errors.length, 1);

// mauvais formats : refusés sans rien écrire
for (const body of [{ company: 'x' }, { company: { queues: 'x' } }, { company: { testedLines: [] } }, { company: { onboarding: 3 } }, { user: [] }]) {
  assert(normalizeWorkspaceInput(body).errors.length > 0, `refus : ${JSON.stringify(body)}`);
}
assert.equal(normalizeWorkspaceInput({ company: { queues: Array.from({ length: 51 }, (_, i) => ({ id: `q${i}`, name: 'n' })) } }).errors.length, 1, 'plafond de files');
assert.equal(normalizeWorkspaceInput({ user: { activeOperationId: 'pas-un-id' } }).value.user.activeOperationId, null);
// partie absente : rien n'est écrasé
assert.deepEqual(normalizeWorkspaceInput({ user: { activeOperationId: null } }).value, { user: { activeOperationId: null } });
assert.deepEqual(normalizeWorkspaceInput({}).value, {});

console.log('callCenterWorkspaceStateValidation OK');
