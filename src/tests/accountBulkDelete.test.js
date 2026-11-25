/**
 * Suppression en masse depuis la console d'administration : POST /api/admin/users/bulk-delete.
 * Sans base de données, sans Stripe, sans Twilio, sans e-mail réel : toutes les dépendances du service sont simulées.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';

const { authenticate } = await import('../middleware/auth.js');
const { requireAdmin } = await import('../middleware/requireAdmin.js');
const gate = await import('../services/accountGate.js');
const closure = await import('../services/accountClosureService.js');
const { createAccountClosureService, AccountClosureError, BULK_DELETE_MAX, bulkConfirmText } = closure;
const adminRoutes = (await import('../routes/adminRoutes.js')).default;
const { adminBulkDeleteUsers } = await import('../controllers/adminController.js');

const ADMIN = '64b000000000000000000077';
const id = (n) => `64b0000000000000000000${String(n).padStart(2, '0')}`;
const bearer = (payload) => `Bearer ${jwt.sign(payload, 'test-secret')}`;

function makeUser(n, over = {}) {
  return { _id: id(n), email: `compte${n}@exemple.fr`, typeUser: 'company', disabled: false, ...over };
}

/** Service réel (createAccountClosureService) avec des dépendances simulées ; `failFor` : comptes dont l'orchestrateur échoue. */
function makeEnv({ users = [], members = {}, failFor = new Set(), mailFails = new Set(), auditFails = false } = {}) {
  const log = { audits: [], deletions: [], purged: [], deleted: [], mails: [], errors: [], active: 0, maxActive: 0 };
  const store = new Map(users.map((u) => [String(u._id), u]));
  const svc = createAccountClosureService({
    findUser: async (uid) => store.get(String(uid)) || null,
    ownedCompanyIds: async (uid) => [`c-${uid}`],
    otherMembersCount: async (companyIds) => members[companyIds[0]] || 0,
    accountProduct: async () => 'nomad',
    purgeOrchestrator: async (args) => {
      log.active += 1;
      log.maxActive = Math.max(log.maxActive, log.active);
      await new Promise((r) => setTimeout(r, 5));
      log.active -= 1;
      if (failFor.has(args.userId)) throw new AccountClosureError(502, 'ACCOUNT_PURGE_FAILED', 'stripe down');
      log.purged.push(args);
      return { subscriptionsCanceled: ['sub_x'], numbersReturned: ['+33142000007'] };
    },
    recordDeletion: async (e) => { log.deletions.push(e); },
    recordAudit: async (e) => { if (auditFails) throw new Error('db down'); log.audits.push(e); },
    deleteRegistrationData: async (args) => { log.deleted.push(args); store.delete(String(args.userId)); return { userDeleted: true }; },
    sendDeletionEmail: async (args) => { if (mailFails.has(args.email)) throw new Error('smtp down'); log.mails.push(args); },
    log: (...a) => { log.errors.push(a.join(' ')); },
    now: () => new Date('2026-11-24T10:42:00Z'),
  });
  return { svc, log, store };
}

const admin = { userId: ADMIN };

test('texte de confirmation : « SUPPRIMER n » exigé (n = nombre de comptes), rien n’est lancé sinon', async () => {
  const { svc, log } = makeEnv({ users: [makeUser(1), makeUser(2)] });
  const ids = [id(1), id(2)];
  for (const confirmText of [undefined, '', 'SUPPRIMER', 'SUPPRIMER 1', 'SUPPRIMER 3', 'supprimer 2', 'DELETE 2']) {
    await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: ids, confirmText, admin }),
      (e) => e.code === 'CONFIRMATION_MISMATCH' && e.statusCode === 400, `refusé : ${confirmText}`);
  }
  assert.equal(log.purged.length, 0);
  assert.equal(log.audits.length, 0);
  assert.equal(bulkConfirmText(2), 'SUPPRIMER 2');
  // Espaces en trop tolérés.
  const out = await svc.bulkDeleteAccounts({ userIds: ids, confirmText: '  SUPPRIMER   2 ', admin });
  assert.equal(out.totals.deleted, 2);
});

test('liste invalide : vide, pas un tableau, doublons, plus de 50 comptes => 400, rien n’est lancé', async () => {
  const { svc, log } = makeEnv({ users: [makeUser(1)] });
  await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: [], confirmText: 'SUPPRIMER 0', admin }), (e) => e.code === 'INVALID_USER_IDS');
  await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: id(1), confirmText: 'SUPPRIMER 1', admin }), (e) => e.code === 'INVALID_USER_IDS');
  await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: [id(1), id(1)], confirmText: 'SUPPRIMER 2', admin }), (e) => e.code === 'INVALID_USER_IDS');
  await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: [id(1), 42], confirmText: 'SUPPRIMER 2', admin }), (e) => e.code === 'INVALID_USER_IDS');
  assert.equal(BULK_DELETE_MAX, 50);
  const many = Array.from({ length: 51 }, (_, i) => `64b00000000000000000${String(i).padStart(4, '0')}`);
  await assert.rejects(() => svc.bulkDeleteAccounts({ userIds: many, confirmText: 'SUPPRIMER 51', admin }), (e) => e.code === 'TOO_MANY_USERS' && e.statusCode === 400);
  assert.equal(log.purged.length, 0);
});

test('50 comptes acceptés, traités 3 à la fois au plus, résultats dans l’ordre demandé', async () => {
  const users = Array.from({ length: 50 }, (_, i) => makeUser(i));
  const { svc, log } = makeEnv({ users });
  const out = await svc.bulkDeleteAccounts({ userIds: users.map((u) => u._id), confirmText: 'SUPPRIMER 50', admin });
  assert.equal(out.totals.deleted, 50);
  assert.deepEqual(out.results.map((r) => r.userId), users.map((u) => u._id));
  assert.ok(log.maxActive <= 3, `concurrence ${log.maxActive}`);
  assert.ok(log.maxActive >= 2, 'traitement en parallèle limité, pas un par un');
});

test('résultats par compte : supprimé / refusé (protégé, admin, société avec membres, introuvable) / échec ; le lot continue', async () => {
  const users = [
    makeUser(1),
    makeUser(2, { email: 'chafik.sabiry4apple@harx.ai' }),
    makeUser(3, { typeUser: 'admin' }),
    makeUser(4),
    makeUser(5),
    makeUser(6),
  ];
  const { svc, log, store } = makeEnv({
    users,
    members: { [`c-${id(4)}`]: 2 },
    failFor: new Set([id(5)]),
    mailFails: new Set(['compte6@exemple.fr']),
  });
  const ids = [id(1), id(2), id(3), id(4), id(5), id(99), id(6)];
  const out = await svc.bulkDeleteAccounts({ userIds: ids, confirmText: 'SUPPRIMER 7', admin });
  const by = Object.fromEntries(out.results.map((r) => [r.userId, r]));

  assert.deepEqual(by[id(1)], { userId: id(1), email: 'compte1@exemple.fr', status: 'deleted', confirmationEmailSent: true });
  assert.deepEqual(by[id(2)], { userId: id(2), email: 'chafik.sabiry4apple@harx.ai', status: 'refused', code: 'PROTECTED_ACCOUNT' });
  assert.equal(by[id(3)].status, 'refused');
  assert.equal(by[id(3)].code, 'ADMIN_ACCOUNT');
  assert.equal(by[id(4)].status, 'refused');
  assert.equal(by[id(4)].code, 'COMPANY_HAS_MEMBERS');
  assert.deepEqual(by[id(5)], { userId: id(5), email: 'compte5@exemple.fr', status: 'failed', code: 'ACCOUNT_PURGE_FAILED' });
  assert.deepEqual(by[id(99)], { userId: id(99), email: null, status: 'refused', code: 'ACCOUNT_NOT_FOUND' });
  // Échec de l'e-mail : le compte est supprimé quand même (même règle que la suppression unitaire).
  assert.deepEqual(by[id(6)], { userId: id(6), email: 'compte6@exemple.fr', status: 'deleted', confirmationEmailSent: false });

  assert.deepEqual(out.totals, { requested: 7, deleted: 2, refused: 4, failed: 1 });
  // Le compte Apple, l'admin, la société avec équipe et l'échec d'orchestrateur restent en place.
  for (const n of [2, 3, 4, 5]) assert.ok(store.has(id(n)), `compte ${n} conservé`);
  assert.deepEqual(log.purged.map((p) => p.userId).sort(), [id(1), id(6)].sort(), 'orchestrateur appelé seulement pour les comptes supprimables');
});

test('idempotent : relancer le même lot => comptes déjà supprimés refusés ACCOUNT_NOT_FOUND, rien n’est relancé', async () => {
  const { svc, log } = makeEnv({ users: [makeUser(1), makeUser(2)] });
  const ids = [id(1), id(2)];
  await svc.bulkDeleteAccounts({ userIds: ids, confirmText: 'SUPPRIMER 2', admin });
  assert.equal(log.purged.length, 2);
  const again = await svc.bulkDeleteAccounts({ userIds: ids, confirmText: 'SUPPRIMER 2', admin });
  assert.deepEqual(again.results.map((r) => [r.status, r.code]), [['refused', 'ACCOUNT_NOT_FOUND'], ['refused', 'ACCOUNT_NOT_FOUND']]);
  assert.equal(log.purged.length, 2, 'aucune nouvelle purge');
  assert.deepEqual(again.totals, { requested: 2, deleted: 0, refused: 2, failed: 0 });
});

test('journal : une ligne par compte supprimé (même ligne que la suppression unitaire, avec l’identifiant du lot) + une ligne pour le lot', async () => {
  const { svc, log } = makeEnv({ users: [makeUser(1), makeUser(2, { typeUser: 'admin' }), makeUser(3)], failFor: new Set([id(3)]) });
  const out = await svc.bulkDeleteAccounts({ userIds: [id(1), id(2), id(3)], confirmText: 'SUPPRIMER 3', admin });
  assert.equal(log.deletions.length, 1);
  assert.deepEqual(log.deletions[0].actor, { type: 'admin', adminId: ADMIN, batchId: out.batchId });
  assert.equal(log.deletions[0].userId, id(1));
  assert.equal(log.audits.length, 1);
  const batch = log.audits[0];
  assert.equal(batch.action, 'accounts_bulk_deleted');
  assert.equal(batch.adminId, ADMIN);
  assert.equal(batch.batchId, out.batchId);
  assert.ok(batch.at instanceof Date);
  assert.deepEqual([batch.requested, batch.deleted, batch.refused, batch.failed], [3, 1, 1, 1]);
  assert.ok(!JSON.stringify([...log.deletions, ...log.audits]).includes('@'), 'aucune adresse e-mail dans le journal');
  // E-mail de confirmation : même canal et même texte que la suppression unitaire par un admin.
  assert.equal(log.mails.length, 1);
  assert.equal(log.mails[0].byAdmin, true);
  assert.equal(log.mails[0].product, 'nomad');
});

test('journal du lot en échec : les résultats sont quand même renvoyés', async () => {
  const { svc, log } = makeEnv({ users: [makeUser(1)], auditFails: true });
  const out = await svc.bulkDeleteAccounts({ userIds: [id(1)], confirmText: 'SUPPRIMER 1', admin });
  assert.equal(out.totals.deleted, 1);
  assert.ok(log.errors.some((e) => e.includes('journal du lot')));
});

test('réutilise la suppression unitaire : chaque compte passe par deleteAccount', async () => {
  const { svc } = makeEnv({ users: [makeUser(1), makeUser(2)] });
  const seen = [];
  const original = svc.deleteAccount;
  svc.deleteAccount = async (args) => { seen.push(args); return original(args); };
  await svc.bulkDeleteAccounts({ userIds: [id(1), id(2)], confirmText: 'SUPPRIMER 2', admin });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].actor.type, 'admin');
  assert.equal(seen[0].confirmEmail, 'compte1@exemple.fr');
});

test('route : POST /api/admin/users/bulk-delete, admin seulement (authenticate + requireAdmin), déclarée avant /users/:userId', async () => {
  const layer = adminRoutes.stack.find((l) => l.route?.path === '/users/bulk-delete' && l.route.methods.post);
  assert.ok(layer);
  const handles = layer.route.stack.map((s) => s.handle);
  assert.deepEqual(handles, [authenticate, requireAdmin, adminBulkDeleteUsers]);
  const paths = adminRoutes.stack.filter((l) => l.route).map((l) => l.route.path);
  assert.ok(paths.indexOf('/users/bulk-delete') < paths.indexOf('/users/:userId'));

  const { svc, log } = makeEnv({ users: [makeUser(1), makeUser(2, { email: 'chafik.sabiry4apple@harx.ai' })] });
  const saved = closure.accountClosureService.bulkDeleteAccounts;
  closure.accountClosureService.bulkDeleteAccounts = (args) => svc.bulkDeleteAccounts(args);
  gate.setAccountGateLookup(async () => 'active');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (auth, body) => {
    const res = await fetch(`${base}/api/admin/users/bulk-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    const body = { userIds: [id(1), id(2)], confirmText: 'SUPPRIMER 2' };
    assert.equal((await call(null, body)).status, 401);
    assert.equal((await call(bearer({ userId: id(1), typeUser: 'company' }), body)).status, 403);
    assert.equal(log.purged.length, 0);
    const adminAuth = bearer({ userId: ADMIN, typeUser: 'admin' });
    const bad = await call(adminAuth, { ...body, confirmText: 'SUPPRIMER 1' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'CONFIRMATION_MISMATCH');
    const ok = await call(adminAuth, body);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    assert.deepEqual(ok.body.data.results.map((r) => r.status), ['deleted', 'refused']);
    assert.equal(ok.body.data.results[1].code, 'PROTECTED_ACCOUNT');
    assert.deepEqual(ok.body.data.totals, { requested: 2, deleted: 1, refused: 1, failed: 0 });
    assert.equal(log.audits[0].adminId, ADMIN);
  } finally {
    server.close();
    closure.accountClosureService.bulkDeleteAccounts = saved;
    gate.setAccountGateLookup(null);
  }
});

test('liste des utilisateurs : le compte de démonstration Apple est signalé protégé (case non sélectionnable dans la console)', async () => {
  const { markProtected } = await import('../services/adminService.js');
  const rows = markProtected([{ email: 'Chafik.Sabiry4apple@harx.ai' }, { email: 'compte1@exemple.fr' }]);
  assert.deepEqual(rows.map((r) => r.protectedAccount), [true, false]);
});
