import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLedger, deliveryHealth, buildFunnel, renderDashboard } from '../lib/dashboard.js';
import { runDashboard, parseArgs, validate } from '../dashboard.js';

const entries = [
  { email: 'a@example.com', status: 'sent', at: '2026-11-02T09:00:00Z' },
  { email: 'a@example.com', status: 'sent', at: '2026-11-02T09:05:00Z' },
  { email: 'b@example.com', status: 'sent', at: '2026-11-03T09:00:00Z' },
  { email: 'c@example.com', status: 'failed', at: '2026-11-03T10:00:00Z' },
];

test('ledger: duplicates counted once, per-day split, no address kept', () => {
  const s = summarizeLedger(entries);
  assert.equal(s.sent, 2);
  assert.equal(s.failed, 1);
  assert.deepEqual(s.days, [{ day: '2026-11-02', sent: 1, failed: 0 }, { day: '2026-11-03', sent: 1, failed: 1 }]);
  assert.ok(!JSON.stringify(s).includes('example.com'));
});

test('health: wait, ok, warn, stop', () => {
  assert.equal(deliveryHealth({ send: 50 }).state, 'wait');
  assert.equal(deliveryHealth({ send: 1000, delivery: 990, bounce: 5, complaint: 0 }).state, 'ok');
  assert.equal(deliveryHealth({ send: 1000, delivery: 980, bounce: 15, complaint: 0 }).state, 'warn');
  assert.equal(deliveryHealth({ send: 1000, delivery: 950, bounce: 30, complaint: 0 }).state, 'stop');
  assert.equal(deliveryHealth({ send: 1000, delivery: 990, bounce: 0, complaint: 2 }).state, 'stop');
});

const users = [
  { id: 1, segment: 'A', clicked: true },
  { id: 2, segment: 'A', clicked: true },
  { id: 3, segment: 'D', clicked: false },
  { id: 4, segment: 'D', clicked: true },
];
const agents = [
  { userId: 1, flags: { cv: true, basicProfile: true, photo: true, availability: true } },
  { userId: 2, flags: { cv: true, basicProfile: false, photo: false, availability: false } },
];
const subs = [{ userId: 1, status: 'trialing' }, { userId: 2, status: 'incomplete' }];

test('funnel: counts per step and per segment', () => {
  const f = buildFunnel({ users, agents, subs });
  const by = Object.fromEntries(f.steps.map((s) => [s.key, s.count]));
  assert.deepEqual(by, { imported: 4, clicked: 3, agent: 2, cv: 2, basic: 1, photo: 1, availability: 1, plan: 1 });
  assert.deepEqual(f.bySegment, { A: { imported: 2, clicked: 2 }, D: { imported: 2, clicked: 1 } });
  assert.equal(f.steps.find((s) => s.key === 'plan').ofClicked, 1 / 3);
});

test('health: open and click rates are relative to delivered', () => {
  const h = deliveryHealth({ send: 1000, delivery: 900, bounce: 5, open: 450, click: 90 });
  assert.equal(h.openRate, 0.5);
  assert.equal(h.clickRate, 0.1);
});

test('render: self-contained, no address, shows state and funnel', () => {
  const html = renderDashboard({
    generatedAt: 'x', campaign: 'reps-reengagement', ledger: summarizeLedger(entries),
    ses: deliveryHealth({ send: 1000, delivery: 990, bounce: 5, complaint: 0 }), sesDays: [{ day: '2026-11-02', send: 1, delivery: 1, bounce: 0, complaint: 0, reject: 0 }],
    funnel: buildFunnel({ users, agents, subs }), notes: ['n'], limits: { maxBounce: 0.02, maxComplaint: 0.001 },
  });
  assert.ok(html.includes('Ouvertures (SES)') && html.includes('Clics (SES)') && html.includes('Santé de la campagne : OK') && html.includes('Parcours des REPS'));
  assert.ok(!/example\.com|https?:\/\//.test(html));
});

const mk = (over = {}) => {
  const writes = {};
  return {
    writes,
    readFile: () => entries.map((e) => JSON.stringify(e)).join('\n') + '\n{trunc',
    writeFile: (p, c) => { writes[p] = c; },
    fetchSesDays: async () => [{ day: '2026-11-02', send: 200, delivery: 198, bounce: 1, complaint: 0, reject: 0 }],
    fetchFunnelData: async () => ({ users, agents, subs }),
    mongoUri: 'mongodb://u:p@h/db',
    now: () => new Date('2026-11-04T10:00:00Z'),
    log: () => {},
    ...over,
  };
};

test('run: validation, full run, and graceful SES failure', async () => {
  assert.ok(validate(parseArgs(['n', 'd', '--batch-ids', 'b'])).length > 0);
  assert.ok(validate(parseArgs(['n', 'd', '--no-ses'])).length > 0);
  const o = parseArgs(['n', 'd', '--ledger', 'l', '--batch-ids', 'b', '--expect-db', 'harx_recette', '--out', 'o.html']);
  const d = mk();
  const r = await runDashboard(o, d);
  assert.equal(r.exitCode, 0);
  assert.ok(d.writes['o.html'].includes('Parcours'));
  const d2 = mk({ fetchSesDays: async () => { const e = new Error('denied'); e.name = 'AccessDenied'; throw e; } });
  const r2 = await runDashboard(o, d2);
  assert.equal(r2.exitCode, 0);
  assert.ok(d2.writes['o.html'].includes('indisponibles (AccessDenied)'));
  const r3 = await runDashboard(o, mk({ mongoUri: undefined }));
  assert.equal(r3.exitCode, 1);
});
