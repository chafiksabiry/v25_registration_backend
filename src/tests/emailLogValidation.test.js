import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmailLogEntry, MAX_BULK_ENTRIES } from '../utils/emailLogValidation.js';

const valid = {
  zoho_deal_id: '6350485000004965046',
  zoho_contact_id: '6350485000001151616',
  email: '  Saad.Lamghari@Gmail.com ',
  batch: 0,
};

test('normalise une entree snake_case valide', () => {
  const result = normalizeEmailLogEntry(valid);
  assert.equal(result.ok, true);
  assert.equal(result.value.email, 'saad.lamghari@gmail.com');
  assert.equal(result.value.zohoDealId, '6350485000004965046');
  assert.equal(result.value.campaign, 'reps_activation');
  assert.equal(result.value.deliveryStatus, 'unknown');
  assert.equal(result.value.deliveryConfirmed, false);
  assert.equal(result.value.zohoUpdateStatus, 'SUCCESS');
});

test('accepte camelCase et une campagne par defaut', () => {
  const result = normalizeEmailLogEntry(
    { zohoDealId: '6350485000004965047', email: 'a@b.co' },
    { campaign: 'test_campaign' }
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.campaign, 'test_campaign');
});

test('rejette un email invalide', () => {
  assert.equal(normalizeEmailLogEntry({ ...valid, email: 'afef1977*@gmail' }).ok, false);
  assert.equal(normalizeEmailLogEntry({ ...valid, email: '' }).ok, false);
});

test('rejette un identifiant Zoho non numerique', () => {
  assert.equal(normalizeEmailLogEntry({ ...valid, zoho_deal_id: 'abc' }).ok, false);
  assert.equal(normalizeEmailLogEntry({ ...valid, zoho_contact_id: 'x1' }).ok, false);
});

test('rejette un lot ou un statut de delivrance invalide', () => {
  assert.equal(normalizeEmailLogEntry({ ...valid, batch: -1 }).ok, false);
  assert.equal(normalizeEmailLogEntry({ ...valid, batch: 1.5 }).ok, false);
  assert.equal(normalizeEmailLogEntry({ ...valid, delivery_status: 'sent' }).ok, false);
});

test('deliveryConfirmed est derive du statut', () => {
  assert.equal(normalizeEmailLogEntry({ ...valid, delivery_status: 'delivered' }).value.deliveryConfirmed, true);
  assert.equal(normalizeEmailLogEntry({ ...valid, delivery_status: 'bounced' }).value.deliveryConfirmed, false);
});

test('rejette une entree qui n est pas un objet', () => {
  assert.equal(normalizeEmailLogEntry(null).ok, false);
  assert.equal(normalizeEmailLogEntry([]).ok, false);
  assert.equal(normalizeEmailLogEntry('x').ok, false);
});

test('la taille maximale d un lot reste compatible avec la limite de 100 ko', () => {
  assert.equal(MAX_BULK_ENTRIES, 100);
});
