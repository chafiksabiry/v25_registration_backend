import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  createAccountDeletionCodeService, codeHash, DELETION_REQUEST_RESPONSE, DeletionCodeError, MAX_ATTEMPTS, CODE_TTL_MS,
} from '../services/accountDeletionCodeService.js';
import { createAccountClosureService, AccountClosureError } from '../services/accountClosureService.js';
import { accountDeletionCodeEmail } from '../utils/nomadAppMessages.js';

const ENV = { JWT_SECRET: 'test-secret' };
const T0 = new Date('2026-11-26T10:00:00Z');

function setup({ users = [], now = T0, code = '123456', deleteAccount } = {}) {
  const ctx = { users, sent: [], deletes: [], clock: now };
  const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o);
  ctx.svc = createAccountDeletionCodeService({
    now: () => ctx.clock,
    env: ENV,
    log: () => {},
    randomCode: () => code,
    findUserByEmail: async (email) => users.find((u) => u.email === email) || null,
    updateUser: async (filter, update) => {
      const u = users.find((x) => String(x._id) === String(filter._id));
      if (!u) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set)) {
        const parts = k.split('.');
        let o = u;
        for (const p of parts.slice(0, -1)) { o[p] = o[p] || {}; o = o[p]; }
        o[parts.at(-1)] = v;
      }
      void get;
      return { modifiedCount: 1 };
    },
    sendEmail: async (m) => { ctx.sent.push(m); },
    deleteAccount: deleteAccount || (async (args) => { ctx.deletes.push(args); return { deletedAt: T0 }; }),
  });
  return ctx;
}
const user = (over = {}) => ({ _id: new mongoose.Types.ObjectId(), email: 'alex@example.com', ...over });

test('demande : même réponse que le compte existe ou non ; code envoyé seulement s’il existe ; empreinte seule en base', async () => {
  const u = user();
  const ctx = setup({ users: [u] });
  const a = await ctx.svc.request({ email: ' Alex@Example.com ', lang: 'fr' });
  const b = await ctx.svc.request({ email: 'nobody@example.com', lang: 'fr' });
  assert.deepEqual(a.response, DELETION_REQUEST_RESPONSE);
  assert.deepEqual(b.response, DELETION_REQUEST_RESPONSE);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].to, 'alex@example.com');
  assert.match(ctx.sent[0].text, /123456/);
  assert.equal(u.accountDeletionCode.hash, codeHash(u._id, '123456', ENV));
  assert.ok(!JSON.stringify(u.accountDeletionCode).includes('123456'));
  assert.equal(u.accountDeletionCode.expiresAt.getTime(), T0.getTime() + CODE_TTL_MS);
  await assert.rejects(ctx.svc.request({ email: 'bad' }), (e) => e instanceof DeletionCodeError && e.code === 'INVALID_EMAIL');
});

test('demande : au plus un envoi par minute ; compte désactivé : aucun envoi', async () => {
  const u = user();
  const ctx = setup({ users: [u, user({ email: 'off@example.com', disabled: true })] });
  await ctx.svc.request({ email: 'alex@example.com' });
  ctx.clock = new Date(T0.getTime() + 30 * 1000);
  assert.equal((await ctx.svc.request({ email: 'alex@example.com' })).sent, false);
  ctx.clock = new Date(T0.getTime() + 61 * 1000);
  assert.equal((await ctx.svc.request({ email: 'alex@example.com' })).sent, true);
  assert.equal((await ctx.svc.request({ email: 'off@example.com' })).sent, false);
  assert.equal(ctx.sent.length, 2);
});

test('confirmation : bon code -> suppression par le service existant (acteur code e-mail), code à usage unique', async () => {
  const u = user();
  const ctx = setup({ users: [u] });
  await ctx.svc.request({ email: 'alex@example.com' });
  await ctx.svc.confirm({ email: 'alex@example.com', code: '123 456' });
  assert.deepEqual(ctx.deletes[0], { userId: String(u._id), actor: { type: 'self-email-code', verified: true }, email: 'alex@example.com', product: 'nomad' });
  assert.equal(u.accountDeletionCode.hash, null);
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '123456' }), (e) => e.code === 'INVALID_CODE');
  assert.equal(ctx.deletes.length, 1);
});

test('confirmation : faux code, code expiré, compte inconnu -> même erreur ; 5 essais au plus', async () => {
  const u = user();
  const ctx = setup({ users: [u] });
  await assert.rejects(ctx.svc.confirm({ email: 'nobody@example.com', code: '123456' }), (e) => e.code === 'INVALID_CODE');
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: 'abc' }), (e) => e.code === 'INVALID_CODE');
  await ctx.svc.request({ email: 'alex@example.com' });
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '000000' }), (e) => e.code === 'INVALID_CODE');
    assert.equal(u.accountDeletionCode.attempts, i);
  }
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '000000' }), (e) => e.code === 'INVALID_CODE');
  assert.equal(u.accountDeletionCode.hash, null); // épuisé : effacé
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '123456' }), (e) => e.code === 'INVALID_CODE');
  ctx.clock = new Date(T0.getTime() + 2 * 60 * 1000);
  await ctx.svc.request({ email: 'alex@example.com' });
  ctx.clock = new Date(ctx.clock.getTime() + CODE_TTL_MS + 1);
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '123456' }), (e) => e.code === 'INVALID_CODE');
  assert.equal(ctx.deletes.length, 0);
});

test('confirmation : refus du service existant transmis (société avec d’autres membres)', async () => {
  const u = user();
  const ctx = setup({ users: [u], deleteAccount: async () => { throw new AccountClosureError(409, 'COMPANY_HAS_MEMBERS', 'members'); } });
  await ctx.svc.request({ email: 'alex@example.com' });
  await assert.rejects(ctx.svc.confirm({ email: 'alex@example.com', code: '123456' }), (e) => e instanceof AccountClosureError && e.code === 'COMPANY_HAS_MEMBERS');
});

test('service de suppression : acteur « code e-mail » accepté seulement vérifié et pour la même adresse ; règle des membres gardée', async () => {
  const u = { _id: new mongoose.Types.ObjectId(), email: 'alex@example.com', typeUser: 'call-center', comparePassword: async () => false };
  let purged = 0;
  const svc = createAccountClosureService({
    findUser: async () => u,
    ownedCompanyIds: async () => ['c1'],
    otherMembersCount: async () => 2,
    purgeOrchestrator: async () => { purged++; return {}; },
    log: () => {},
  });
  await assert.rejects(svc.deleteAccount({ userId: String(u._id), actor: { type: 'self-email-code' }, email: u.email }), (e) => e.code === 'INVALID_CREDENTIALS');
  await assert.rejects(svc.deleteAccount({ userId: String(u._id), actor: { type: 'self-email-code', verified: true }, email: 'other@example.com' }), (e) => e.code === 'INVALID_CREDENTIALS');
  await assert.rejects(svc.deleteAccount({ userId: String(u._id), actor: { type: 'self-email-code', verified: true }, email: u.email }), (e) => e.code === 'COMPANY_HAS_MEMBERS');
  assert.equal(purged, 0);
});

test('e-mail du code : 4 langues, code visible, aucun mot NOMAD, arabe RTL', () => {
  for (const lang of ['fr', 'en', 'es', 'ar']) {
    const m = accountDeletionCodeEmail({ code: '654321', lang });
    assert.ok(m.html.includes('654321') && m.text.includes('654321'));
    assert.ok(!/nomad/i.test(m.subject + m.html.replace(/<[^>]+>/g, ' ') + m.text));
    assert.ok(m.html.includes('src="cid:harx-logo"'));
    if (lang === 'ar') assert.ok(m.html.includes('dir="rtl"'));
  }
  assert.match(accountDeletionCodeEmail({ code: '1', lang: 'xx' }).subject, /deletion code/);
});
