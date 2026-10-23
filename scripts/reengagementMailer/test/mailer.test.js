import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderEmail, buildLink, SUBJECT } from '../lib/template.js';
import { parseTokens, maskEmail } from '../lib/csv.js';
import { readLedger, appendLedger } from '../lib/ledger.js';
import { evaluateRates } from '../lib/guard.js';
import { runCampaign, validate, parseArgs } from '../send.js';

const TOKEN = 'A'.repeat(43);
const mkTokens = (n, prefix = 'rep') =>
  'email,token\n' + Array.from({ length: n }, (_, i) => `${prefix}${i}@example.com,${TOKEN}${i}`).join('\n') + '\n';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-'));

function makeDeps({ counts = { send: 0, bounce: 0, complaint: 0 }, files = {}, failOn = null, account = '111' } = {}) {
  const sent = [];
  const logs = [];
  const writes = {};
  return {
    sent, logs, writes,
    readFile: (p) => files[p] ?? '',
    writeFile: (p, c) => { writes[p] = c; },
    loadSegments: () => new Map(),
    sleep: async () => {},
    log: (m) => logs.push(m),
    getAccountId: async () => account,
    fetchCounts: async () => (typeof counts === 'function' ? counts(sent.length) : counts),
    send: async (m) => {
      if (failOn && failOn(m, sent.length)) { const e = new Error('nope'); e.name = failOn(m, sent.length); throw e; }
      sent.push(m);
      return { messageId: `id-${sent.length}` };
    },
  };
}

test('template: link, code, plan, deadline, postal address, STOP, no undefined', () => {
  const link = buildLink('https://harx.ai/', 'tok+/=');
  assert.equal(link, 'https://harx.ai/auth/reactivate?t=tok%2B%2F%3D');
  const { subject, text, html } = renderEmail({ link });
  assert.equal(subject, SUBJECT);
  for (const body of [text, html]) {
    assert.ok(body.includes('REPS2027'));
    assert.ok(body.includes('31 décembre 2026'));
    assert.ok(body.includes('Lewes'));
    assert.ok(body.includes('STOP'));
    assert.ok(!body.includes('undefined'));
    assert.ok(!/Bonjour [A-Z]/.test(body));
  }
  assert.ok(text.includes(link));
  assert.ok(html.includes('IN THE RICH MAN&#39;S WORLD'));
  assert.throws(() => buildLink('http://harx.ai', 'x'));
});

test('csv: skips header, invalid lines and duplicates', () => {
  const { rows, invalid } = parseTokens(`email,token\nA@x.com,${TOKEN}\na@x.com,${TOKEN}\nbad,${TOKEN}\nb@x.com,short\n`);
  assert.deepEqual(rows.map((r) => r.email), ['a@x.com']);
  assert.equal(invalid.length, 2);
  assert.equal(maskEmail('john@gmail.com'), 'j***@g***.com');
});

test('ledger: resume skips sent, retries failed', () => {
  const dir = tmp(); const p = path.join(dir, 'l.jsonl');
  appendLedger(p, { email: 'a@x.com', status: 'sent' });
  appendLedger(p, { email: 'b@x.com', status: 'failed' });
  fs.appendFileSync(p, '{"truncated');
  const s = readLedger(p);
  assert.equal(s.get('a@x.com').status, 'sent');
  assert.equal(s.get('b@x.com').status, 'failed');
});

test('guard: thresholds and minimum sample', () => {
  assert.equal(evaluateRates({ send: 50, bounce: 10, complaint: 5 }).ok, true);
  assert.equal(evaluateRates({ send: 1000, bounce: 21, complaint: 0 }).ok, false);
  assert.equal(evaluateRates({ send: 1000, bounce: 20, complaint: 0 }).ok, true);
  assert.equal(evaluateRates({ send: 1000, bounce: 0, complaint: 2 }).ok, false);
  assert.equal(evaluateRates({ send: 1000, bounce: 0, complaint: 1 }).ok, true);
});

test('validate: --apply needs the safety flags', () => {
  const o = parseArgs(['node', 'send.js', '--tokens', 't.csv', '--link-base', 'https://harx.ai', '--apply']);
  assert.equal(validate(o).length, 4);
  assert.equal(validate(parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://h'])).length, 0);
});

test('dry run sends nothing and writes the preview', async () => {
  const dir = tmp();
  const deps = makeDeps({ files: { t: mkTokens(5) } });
  const o = parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', '3', '--preview-out', 'p.html']);
  const r = await runCampaign(o, deps);
  assert.equal(r.dryRun, true);
  assert.equal(r.selected, 3);
  assert.equal(deps.sent.length, 0);
  assert.ok(deps.writes['p.html'].includes('PREVIEW-TOKEN'));
  assert.ok(!deps.writes['p.html'].includes(TOKEN));
});

test('apply: refuses another AWS account', async () => {
  const dir = tmp();
  const deps = makeDeps({ files: { t: mkTokens(2) }, account: '999' });
  const o = parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', '2', '--apply', '--expect-account', '111', '--config-set', 'c', '--ledger', path.join(dir, 'l')]);
  const r = await runCampaign(o, deps);
  assert.equal(r.exitCode, 1);
  assert.equal(deps.sent.length, 0);
});

test('apply: sends up to the limit, once, with headers, and resumes without duplicates', async () => {
  const dir = tmp(); const ledger = path.join(dir, 'l.jsonl');
  const files = { t: mkTokens(10), ex: 'rep1@example.com\n' };
  const base = ['node', 's', '--tokens', 't', '--exclude', 'ex', '--link-base', 'https://harx.ai', '--apply', '--expect-account', '111', '--config-set', 'cs', '--ledger', ledger, '--check-every', '1000'];
  const d1 = makeDeps({ files });
  const r1 = await runCampaign(parseArgs([...base, '--limit', '4']), d1);
  assert.equal(r1.sent, 4);
  assert.ok(!d1.sent.some((m) => m.to === 'rep1@example.com'));
  assert.equal(d1.sent[0].configSet, 'cs');
  assert.equal(d1.sent[0].listUnsubscribe, '<mailto:reps-support@harx.ai?subject=STOP>');
  assert.ok(d1.sent[0].text.includes('/auth/reactivate?t='));
  const d2 = makeDeps({ files });
  const r2 = await runCampaign(parseArgs([...base, '--limit', '4']), d2);
  assert.equal(r2.sent, 4);
  const all = [...d1.sent, ...d2.sent].map((m) => m.to);
  assert.equal(new Set(all).size, 8);
});

test('apply: stops mid-run when the bounce rate is too high', async () => {
  const dir = tmp();
  const files = { t: mkTokens(30) };
  const deps = makeDeps({ files, counts: (n) => (n >= 10 ? { send: 1000, bounce: 50, complaint: 0 } : { send: 0, bounce: 0, complaint: 0 }) });
  const o = parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', '30', '--apply', '--expect-account', '111', '--config-set', 'c', '--ledger', path.join(dir, 'l'), '--check-every', '10']);
  const r = await runCampaign(o, deps);
  assert.equal(r.exitCode, 3);
  assert.equal(deps.sent.length, 10);
});

test('apply: refuses to start if the previous stage is already outside the limits', async () => {
  const dir = tmp();
  const deps = makeDeps({ files: { t: mkTokens(3) }, counts: { send: 1000, bounce: 0, complaint: 5 } });
  const o = parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', '3', '--apply', '--expect-account', '111', '--config-set', 'c', '--ledger', path.join(dir, 'l')]);
  const r = await runCampaign(o, deps);
  assert.equal(r.exitCode, 3);
  assert.equal(deps.sent.length, 0);
});

test('apply: aborts after 10 consecutive failures; a lone failure is logged and skipped', async () => {
  const dir = tmp();
  const o = (n) => parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', String(n), '--apply', '--expect-account', '111', '--config-set', 'c', '--ledger', path.join(dir, `l${n}`), '--check-every', '1000']);
  const dAll = makeDeps({ files: { t: mkTokens(20) }, failOn: () => 'MessageRejected' });
  const rAll = await runCampaign(o(20), dAll);
  assert.equal(rAll.exitCode, 2);
  assert.equal(rAll.failed, 10);
  const dOne = makeDeps({ files: { t: mkTokens(5) }, failOn: (m) => (m.to === 'rep2@example.com' ? 'MessageRejected' : null) });
  const rOne = await runCampaign(o(5), dOne);
  assert.equal(rOne.exitCode, 0);
  assert.equal(rOne.sent, 4);
  assert.equal(rOne.failed, 1);
});

test('apply: a paused or suspended account aborts immediately', async () => {
  const dir = tmp();
  const deps = makeDeps({ files: { t: mkTokens(5) }, failOn: () => 'SendingPausedException' });
  const o = parseArgs(['node', 's', '--tokens', 't', '--link-base', 'https://harx.ai', '--limit', '5', '--apply', '--expect-account', '111', '--config-set', 'c', '--ledger', path.join(dir, 'l')]);
  const r = await runCampaign(o, deps);
  assert.equal(r.exitCode, 2);
});
