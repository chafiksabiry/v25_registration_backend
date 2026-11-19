import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapiPayload, sendSignUpEvent, sha256 } from '../services/metaCapi.js';

const base = { email: '  Jean.Dupont@Example.COM ', eventId: 'evt-123', marketingConsent: true, ip: '203.0.113.9', userAgent: 'UA', fbp: 'fb.1.2.3', fbc: 'fb.1.2.4', sourceUrl: 'https://harx.ai/fr/auth/register-company', now: 1_800_000_000_000 };

test('sans consentement marketing : rien n\'est construit', () => {
  assert.equal(buildCapiPayload({ ...base, marketingConsent: false }), null);
  assert.equal(buildCapiPayload({ ...base, marketingConsent: undefined }), null);
  assert.equal(buildCapiPayload({ ...base, marketingConsent: 'true' }), null);
});

test('payload : e-mail haché, aucun nom/téléphone, même event_id', () => {
  const p = buildCapiPayload(base);
  const ev = p.data[0];
  assert.equal(ev.event_name, 'CompleteRegistration');
  assert.equal(ev.event_id, 'evt-123');
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.event_time, 1_800_000_000);
  assert.deepEqual(ev.user_data.em, [sha256('jean.dupont@example.com')]);
  assert.equal(ev.user_data.client_ip_address, '203.0.113.9');
  assert.ok(!JSON.stringify(p).includes('Dupont'));
  assert.ok(!('ph' in ev.user_data) && !('fn' in ev.user_data) && !('ln' in ev.user_data));
});

test('event_id ou e-mail manquant : pas d\'envoi', () => {
  assert.equal(buildCapiPayload({ ...base, eventId: '' }), null);
  assert.equal(buildCapiPayload({ ...base, email: '' }), null);
});

test('sendSignUpEvent : sans jeton rien n\'est envoyé ; ne rejette jamais', async () => {
  let called = 0;
  const f = async () => { called++; return { ok: true }; };
  assert.deepEqual(await sendSignUpEvent(base, { token: '', fetchImpl: f }), { sent: false, reason: 'no-token' });
  assert.equal(called, 0);
  assert.deepEqual(await sendSignUpEvent({ ...base, marketingConsent: false }, { token: 't', fetchImpl: f }), { sent: false, reason: 'not-permitted' });
  assert.equal(called, 0);
  const r = await sendSignUpEvent(base, { token: 't', fetchImpl: async () => { throw new Error('boom'); } });
  assert.equal(r.sent, false);
  const ok = await sendSignUpEvent(base, { token: 't', fetchImpl: f });
  assert.equal(ok.sent, true);
  assert.equal(called, 1);
});
