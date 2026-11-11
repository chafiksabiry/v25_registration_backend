import assert from 'node:assert/strict';
import { clientView, normalizeClientInput } from '../services/callCenterClientValidation.js';

// Création : le nom est obligatoire
assert.equal(normalizeClientInput({}).errors.length, 1);
assert.equal(normalizeClientInput({ name: ' A ' }).errors.length, 1);
const ok = normalizeClientInput({ name: '  Globex  ', kind: 'internal', contactEmail: ' CONTACT@Globex.FR ', billingAddress: { city: 'Paris', street: '1 rue A' } });
assert.deepEqual(ok.errors, []);
assert.equal(ok.value.name, 'Globex');
assert.equal(ok.value.contactEmail, 'contact@globex.fr');
assert.equal(ok.value.billingAddress.city, 'Paris');
assert.equal(ok.value.kind, 'internal');

// Types et e-mail invalides
assert.equal(normalizeClientInput({ name: 'Globex', kind: 'autre' }).errors.length, 1);
assert.equal(normalizeClientInput({ name: 'Globex', contactEmail: 'pas-un-mail' }).errors.length, 1);

// Mise à jour partielle : seuls les champs fournis sont modifiés, le nom n'est pas exigé
const part = normalizeClientInput({ notes: 'à rappeler' }, { partial: true });
assert.deepEqual(part.errors, []);
assert.deepEqual(part.value, { notes: 'à rappeler' });
assert.equal(normalizeClientInput({ name: '' }, { partial: true }).errors.length, 1);

// Représentation
const v = clientView({ _id: 'abc', name: 'Globex', createdAt: '2026-10-25T10:00:00Z' });
assert.equal(v.id, 'abc');
assert.equal(v.status, 'active');
assert.equal(v.kind, 'external');
console.log('callCenterClientValidation.test OK');
