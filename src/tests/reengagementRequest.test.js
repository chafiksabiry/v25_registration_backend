import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  isValidEmail,
  isEligibleForReengageLink,
  canIssueNewLink,
  reengageLinkBase,
  buildReengageLink,
  linkTtlHours,
} from '../utils/reengagementRequest.js';
import { reengageLinkEmail } from '../utils/harxMessages.js';

test('email is normalised and validated', () => {
  assert.equal(normalizeEmail('  Rep@Example.COM '), 'rep@example.com');
  assert.ok(isValidEmail('a.b+c@example.co'));
  for (const bad of ['', 'x', 'a@b', 'a b@c.de', '@c.de', null, 'a@'.padEnd(260, 'x') + '.com']) {
    assert.equal(isValidEmail(bad), false, String(bad));
  }
});

test('only migrated v1 reps are eligible', () => {
  assert.equal(isEligibleForReengageLink({ typeUser: 'rep', source: 'harx_v1_import' }), true);
  assert.equal(isEligibleForReengageLink({ typeUser: 'rep', source: 'signup' }), false);
  assert.equal(isEligibleForReengageLink({ typeUser: 'company', source: 'harx_v1_import' }), false);
  assert.equal(isEligibleForReengageLink(null), false);
});

test('cooldown blocks a second link within a minute', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  assert.equal(canIssueNewLink({ reengagement: {} }, now), true);
  assert.equal(canIssueNewLink({ reengagement: { lastRequestedAt: new Date('2026-11-05T09:59:30Z') } }, now), false);
  assert.equal(canIssueNewLink({ reengagement: { lastRequestedAt: new Date('2026-11-05T09:58:00Z') } }, now), true);
});

test('link base and link', () => {
  assert.equal(reengageLinkBase({}), 'https://harx.ai');
  assert.equal(reengageLinkBase({ FRONTEND_URL: 'https://harx.ai/auth/' }), 'https://harx.ai');
  assert.equal(reengageLinkBase({ REENGAGE_LINK_BASE: 'https://x.netlify.app/', FRONTEND_URL: 'https://harx.ai' }), 'https://x.netlify.app');
  assert.equal(buildReengageLink('https://harx.ai', 'a+b/c='), 'https://harx.ai/auth/reactivate?t=a%2Bb%2Fc%3D');
  assert.equal(linkTtlHours({}), 24);
  assert.equal(linkTtlHours({ REENGAGE_LINK_TTL_HOURS: '6' }), 6);
  assert.equal(linkTtlHours({ REENGAGE_LINK_TTL_HOURS: '9999' }), 24);
});

test('link e-mail is bilingual, English first, and contains the link in text and html', () => {
  const link = 'https://harx.ai/auth/reactivate?t=abc';
  const m = reengageLinkEmail({ link, hours: 24 });
  assert.ok(m.subject.startsWith('Your HARX one-click link'));
  assert.ok(m.text.indexOf('Open your HARX space') < m.text.indexOf('Ouvrez votre espace'));
  assert.ok(m.text.includes(link) && m.html.includes(link));
  assert.ok(!/undefined|\$\{/.test(m.html + m.text));
});
