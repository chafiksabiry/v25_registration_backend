import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmailEntry } from '../utils/emailHistoryValidation.js';
import { recordEmailHistory, updateEmailStatuses } from '../services/emailHistoryService.js';

const good = {
  zohoEmailId: 'zm-1001',
  subject: 'Activez votre compte',
  recipient: 'Rep@Example.com',
  sentAt: '2026-11-13T10:30:00.000Z',
  dealId: '123456789012',
};

function fakeStore(users) {
  const writes = [];
  return {
    writes,
    users,
    findByEmail: async (email) => users.find((u) => u.email === email) || null,
    findByDealId: async (id) => users.find((u) => String(u.legacyV1?.crmDealId) === id) || null,
    pushEmail: async (userId, entry) => {
      const user = users.find((u) => u._id === userId);
      user.history = user.history || [];
      if (user.history.some((e) => e.zohoEmailId === entry.zohoEmailId)) return false;
      user.history.push(entry);
      writes.push({ userId, keys: Object.keys(entry) });
      return true;
    },
  };
}

test('refuse un email sans zohoEmailId (non confirme)', () => {
  assert.equal(normalizeEmailEntry({ ...good, zohoEmailId: '' }).ok, false);
  assert.equal(normalizeEmailEntry({ ...good, zohoEmailId: undefined }).ok, false);
});

test('refuse sentAt absent, sans fuseau ou futur', () => {
  assert.equal(normalizeEmailEntry({ ...good, sentAt: undefined }).ok, false);
  assert.equal(normalizeEmailEntry({ ...good, sentAt: '2026-11-13 10:30' }).ok, false);
  assert.equal(normalizeEmailEntry({ ...good, sentAt: '2999-01-01T00:00:00Z' }).ok, false);
});

test('refuse le statut failed et accepte sent par defaut', () => {
  assert.equal(normalizeEmailEntry({ ...good, status: 'failed' }).ok, false);
  const r = normalizeEmailEntry(good);
  assert.equal(r.value.status, 'sent');
  assert.equal(r.value.source, 'zoho_crm');
  assert.equal(r.value.method, 'workflow');
  assert.equal(r.value.recipient, 'rep@example.com');
});

test('enregistre pour un rep existant, sans toucher ses autres donnees', async () => {
  const store = fakeStore([{ _id: 'u1', email: 'rep@example.com', legacyV1: { crmDealId: '123456789012' } }]);
  const report = await recordEmailHistory([good], store);
  assert.equal(report.recorded, 1);
  assert.equal(report.usersFound, 1);
  assert.equal(store.users.length, 1);
  assert.deepEqual(Object.keys(store).filter((k) => /create|upsert|insert/i.test(k)), []);
});

test('ne reenregistre pas un email deja present', async () => {
  const store = fakeStore([{ _id: 'u1', email: 'rep@example.com' }]);
  await recordEmailHistory([good], store);
  const again = await recordEmailHistory([good], store);
  assert.equal(again.recorded, 0);
  assert.equal(again.skippedDuplicates, 1);
  assert.equal(store.users[0].history.length, 1);
});

test('rep introuvable : compte, rien cree', async () => {
  const store = fakeStore([]);
  const report = await recordEmailHistory([good], store);
  assert.equal(report.noUser, 1);
  assert.equal(report.recorded, 0);
  assert.equal(store.users.length, 0);
});

test('retrouve le rep par dealId si l email ne correspond pas', async () => {
  const store = fakeStore([{ _id: 'u2', email: 'autre@example.com', legacyV1: { crmDealId: '123456789012' } }]);
  const report = await recordEmailHistory([good], store);
  assert.equal(report.recorded, 1);
});

test('conflit de deal : rien n est ecrit', async () => {
  const store = fakeStore([{ _id: 'u3', email: 'rep@example.com', legacyV1: { crmDealId: '999999999999' } }]);
  const report = await recordEmailHistory([good], store);
  assert.equal(report.conflicts, 1);
  assert.equal(report.recorded, 0);
});

test('mise a jour de statut seulement vers un statut plus avance', async () => {
  const calls = [];
  const store = { updateStatus: async (id, status, prev) => { calls.push({ id, status, prev }); return true; } };
  const report = await updateEmailStatuses(
    [{ zohoEmailId: 'zm-1001', status: 'delivered' }, { zohoEmailId: 'zm-1001', status: 'sent' }, { zohoEmailId: '', status: 'opened' }],
    store
  );
  assert.equal(report.updated, 1);
  assert.equal(report.rejected.length, 2);
  assert.deepEqual(calls[0].prev, ['sent']);
});
