import assert from 'node:assert/strict';
import { normalizeProfileInput, profileView } from '../services/callCenterOperationProfileValidation.js';

const ok = normalizeProfileInput({
  objective: '  Prospection assurance santé  ',
  dailyVolume: '120',
  kpis: [
    { id: 'contact_rate', label: 'Taux de contact', unit: '%', target: '35', goal: 'min' },
    { id: 'abandon_rate', label: 'Taux d’abandon', unit: '%', target: 5, goal: 'max' },
    { id: 'custom_1', label: 'Devis envoyés', unit: '', target: null, custom: true },
  ],
});
assert.deepEqual(ok.errors, []);
assert.equal(ok.value.objective, 'Prospection assurance santé');
assert.equal(ok.value.dailyVolume, 120);
assert.equal(ok.value.kpis.length, 3);
assert.equal(ok.value.kpis[0].target, 35);
assert.equal(ok.value.kpis[1].goal, 'max');
assert.equal(ok.value.kpis[2].custom, true);

assert.equal(normalizeProfileInput({ dailyVolume: -3 }).errors.length, 1);
assert.equal(normalizeProfileInput({ dailyVolume: null }).value.dailyVolume, null);
assert.equal(normalizeProfileInput({ kpis: 'x' }).errors.length, 1);
assert.equal(normalizeProfileInput({ kpis: [{ id: 'a', label: '' }] }).errors.length, 1);
assert.equal(normalizeProfileInput({ kpis: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }).errors.length, 1);
assert.equal(normalizeProfileInput({ kpis: [{ id: 'a', label: 'A', target: 'abc' }] }).errors.length, 1);
assert.equal(normalizeProfileInput({ kpis: Array.from({ length: 21 }, (_, i) => ({ id: 'k' + i, label: 'K' + i })) }).errors.length, 1);

const view = profileView({ gigId: 'g1', objective: 'x', kpis: [{ id: 'a', label: 'A', target: 2, goal: 'max' }] });
assert.equal(view.kpis[0].goal, 'max');
assert.equal(view.dailyVolume, null);
console.log('callCenterOperationProfileValidation : OK');
