import assert from 'node:assert/strict';
import { normalizeContactInput, normalizeEmail, normalizePhone } from '../services/callCenterCompanyProfileValidation.js';
import { normalizeWorkspaceInput, writableParts } from '../services/callCenterWorkspaceStateValidation.js';

// e-mail
assert.equal(normalizeEmail(' Contact@Nipux.FR '), 'contact@nipux.fr');
for (const bad of ['', 'abc', 'a@b', 'a b@c.fr', '@c.fr', `${'a'.repeat(160)}@c.fr`]) assert.equal(normalizeEmail(bad), null, bad);

// téléphone : international seulement
assert.equal(normalizePhone('+33 6 12 34 56 78'), '+33612345678');
assert.equal(normalizePhone('0033 6 12 34 56 78'), '+33612345678');
assert.equal(normalizePhone('+1 (212) 555-0100'), '+12125550100');
for (const bad of ['0612345678', '+0612345678', '+33', 'abc', '+33 6 12 AB 56 78', '+1234567890123456']) assert.equal(normalizePhone(bad), null, bad);

// coordonnées complètes
const ok = normalizeContactInput({ representativeEmail: 'A@B.fr', phone: '+33 1 42 00 00 00', address: { street: ' 12 rue de la Paix ', postalCode: '75002', city: ' Paris ', extra: 'x' } }, 'FR');
assert.deepEqual(ok.errors, []);
assert.deepEqual(ok.value, { representativeEmail: 'a@b.fr', phone: '+33142000000', address: { street: '12 rue de la Paix', postalCode: '75002', city: 'Paris' } });

// un seul champ suffit ; aucun champ : refus
assert.deepEqual(normalizeContactInput({ phone: '+33142000000' }).value, { phone: '+33142000000' });
assert.equal(normalizeContactInput({}).errors.length, 1);
assert.equal(normalizeContactInput(null).errors.length, 1);

// champs réglementaires refusés, rien n'est retenu
const locked = normalizeContactInput({ name: 'X', siren: '1', country: 'GB', documents: [], kybStatus: 'draft', phone: '+33142000000' });
assert.equal(locked.errors.length, 1);
assert.match(locked.errors[0], /name, siren, country, documents, kybStatus/);
assert.deepEqual(locked.value, {});

// adresse : code postal selon le pays, boîte postale, longueurs
const addr = (a, c) => normalizeContactInput({ address: a }, c).errors.length;
assert.equal(addr({ street: '1 rue A', postalCode: '7500', city: 'Paris' }, 'FR'), 1);
assert.equal(addr({ street: '1 rue A', postalCode: 'SW1A 1AA', city: 'London' }, 'GB'), 0);
assert.equal(addr({ street: '1 rue A', postalCode: '75001', city: 'London' }, 'GB'), 1);
assert.equal(addr({ street: '1 Main St', postalCode: '94105-1234', city: 'SF' }, 'US'), 0);
assert.equal(addr({ street: 'BP 12', postalCode: '75001', city: 'Paris' }, 'FR'), 1);
assert.equal(addr({ street: 'ab', postalCode: '75001', city: 'Paris' }, 'FR'), 1);
assert.equal(addr({ street: '1 rue A', postalCode: '75001', city: 'P' }, 'FR'), 1);
assert.equal(addr('Paris', 'FR'), 1);
assert.equal(addr({ street: '1 rue A', postalCode: '75001', city: 'Paris' }, undefined), 0, 'pays absent = France');

// le profil du centre conserve le téléphone valide (relais par l'état partagé), écarte un numéro invalide
const prof = (phone) => normalizeWorkspaceInput({ company: { profile: { name: 'N', siren: '1', representativeEmail: 'a@b.fr', phone } } }).value.company.profile;
assert.equal(prof('+33 1 42 00 00 00').phone, '+33142000000');
assert.equal(prof('0142000000').phone, undefined);

// l'identité du centre n'est écrite que par le titulaire ; les autres parties restent écrites par un membre
const sent = { company: { profile: { name: 'N' }, queues: [] }, user: { activeOperationId: null } };
assert.deepEqual(Object.keys(writableParts('owner', sent).company), ['profile', 'queues']);
assert.deepEqual(Object.keys(writableParts(undefined, sent).company), ['profile', 'queues']);
assert.deepEqual(Object.keys(writableParts('member', sent).company), ['queues']);
assert.equal(writableParts('member', sent).user !== undefined, true);
assert.equal(writableParts('agent', sent).company, undefined);
