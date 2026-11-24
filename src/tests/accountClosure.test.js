/**
 * Désactivation, réactivation et suppression d'un compte (maquettes A2, A2b, A3, B4) : services et routes, sans base de données.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret';

const { authenticate } = await import('../middleware/auth.js');
const { requireAdmin } = await import('../middleware/requireAdmin.js');
const { authenticateCallCenter } = await import('../middleware/callCenterAuth.js');
const gate = await import('../services/accountGate.js');
const { createAccountClosureService, AccountClosureError, orchestratorOrigin, ACCOUNT_PURGE_SCOPE } = await import('../services/accountClosureService.js');
const authService = (await import('../services/authService.js')).default;
const userRepository = (await import('../repositories/userRepository.js')).default;
const adminRoutes = (await import('../routes/adminRoutes.js')).default;
const userRoutes = (await import('../routes/userRoutes.js')).default;
const { adminUserStatus, adminDeleteUser } = await import('../controllers/adminController.js');
const { deleteOwnAccount } = await import('../controllers/userController.js');

const ME = '64b0000000000000000000a1';
const ADMIN = '64b000000000000000000077';
const COMPANY = '64b0000000000000000000c1';

function fakeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const bearer = (payload) => `Bearer ${jwt.sign(payload, 'test-secret')}`;

/** Passe la requête dans le middleware ; attend la fin s'il est asynchrone. */
async function run(mw, req) {
  const res = fakeRes();
  let reached = false;
  await mw(req, res, () => { reached = true; });
  return { res, reached };
}

// ---------- Blocage par jeton déjà émis (accountGate) ----------

test('jeton déjà émis : compte actif accepté, désactivé refusé 403 ACCOUNT_DISABLED, supprimé refusé 401', async () => {
  const states = { [ME]: 'active' };
  gate.setAccountGateLookup(async (id) => states[id] ?? 'active');
  const req = () => ({ headers: { authorization: bearer({ userId: ME, typeUser: 'company' }) }, path: '/x' });

  let r = await run(authenticate, req());
  assert.equal(r.reached, true, 'compte actif : jeton existant toujours valable');

  states[ME] = 'disabled';
  gate.forgetAccountState(ME);
  r = await run(authenticate, req());
  assert.equal(r.reached, false);
  assert.equal(r.res.statusCode, 403);
  assert.equal(r.res.body.code, 'ACCOUNT_DISABLED');

  states[ME] = 'deleted';
  gate.forgetAccountState(ME);
  r = await run(authenticate, req());
  assert.equal(r.res.statusCode, 401);
  assert.equal(r.res.body.code, 'ACCOUNT_DELETED');

  // Même règle sur les routes du centre d'appels (authenticateCallCenter).
  states[ME] = 'disabled';
  gate.forgetAccountState(ME);
  r = await run(authenticateCallCenter, req());
  assert.equal(r.res.statusCode, 403);
  gate.setAccountGateLookup(null);
});

test('lecture de l’état en échec : le jeton passe (jamais de panne pour les comptes actifs) ; état mis en cache quelques secondes', async () => {
  let calls = 0;
  gate.setAccountGateLookup(async () => { calls += 1; throw new Error('db down'); });
  const r = await run(authenticate, { headers: { authorization: bearer({ userId: ME }) }, path: '/x' });
  assert.equal(r.reached, true);

  gate.setAccountGateLookup(async () => { calls += 1; return 'active'; });
  calls = 0;
  await run(authenticate, { headers: { authorization: bearer({ userId: ME }) }, path: '/x' });
  await run(authenticate, { headers: { authorization: bearer({ userId: ME }) }, path: '/x' });
  assert.equal(calls, 1, 'une seule lecture en base pendant la durée du cache');
  assert.ok(gate.ACCOUNT_GATE_TTL_MS <= 10_000);
  gate.setAccountGateLookup(null);
});

test('sans base connectée (tests, démarrage) : le middleware reste synchrone et accepte le jeton', () => {
  gate.setAccountGateLookup(null);
  const res = fakeRes();
  let reached = false;
  authenticate({ headers: { authorization: bearer({ userId: ME }) }, path: '/x' }, res, () => { reached = true; });
  assert.equal(reached, true);
});

// ---------- Connexion refusée ----------

test('connexion : un compte désactivé est refusé (ACCOUNT_DISABLED), avant tout code envoyé', async () => {
  const hash = bcrypt.hashSync('secret123', 4);
  const original = userRepository.findByEmail;
  let updated = false;
  const originalUpdate = userRepository.update;
  userRepository.update = async () => { updated = true; };
  userRepository.findByEmail = async () => ({
    _id: ME, email: 'a@b.fr', isVerified: true, disabled: true,
    comparePassword: (p) => bcrypt.compare(p, hash),
  });
  await assert.rejects(() => authService.login('a@b.fr', 'secret123', { headers: {} }), (e) => e.code === 'ACCOUNT_DISABLED');
  assert.equal(updated, false, 'aucun code de connexion généré');
  userRepository.findByEmail = original;
  userRepository.update = originalUpdate;
});

// ---------- Service : désactiver / réactiver ----------

function makeUser(over = {}) {
  const hash = bcrypt.hashSync('secret123', 4);
  return {
    _id: ME, email: 'marie.dupont@exemple.fr', typeUser: 'company', disabled: false,
    async comparePassword(p) { return bcrypt.compare(p, hash); },
    async save() { this.saved = (this.saved || 0) + 1; },
    ...over,
  };
}

function makeEnv({ user = makeUser(), companies = [COMPANY], others = 0, purge, mail, product = async () => 'nomad', now = new Date('2026-11-24T10:42:00Z') } = {}) {
  const log = { audits: [], deletions: [], purged: [], deleted: [], mails: [], errors: [], steps: [] };
  const store = new Map(user ? [[String(user.email).toLowerCase(), user]] : []);
  const svc = createAccountClosureService({
    findUser: async (id) => [...store.values()].find((u) => String(u._id) === String(id)) || null,
    ownedCompanyIds: async () => companies,
    otherMembersCount: async () => others,
    accountProduct: async (args) => { log.steps.push('product'); return product(args); },
    purgeOrchestrator: purge || (async (args) => { log.steps.push('purge'); log.purged.push(args); return { subscriptionsCanceled: ['sub_1'], numbersReturned: ['+33142000007'] }; }),
    recordDeletion: async (e) => { log.deletions.push(e); },
    recordAudit: async (e) => { log.audits.push(e); },
    deleteRegistrationData: async (args) => { log.deleted.push(args); store.delete(String(args.email).toLowerCase()); return { userDeleted: true }; },
    // L'e-mail part après l'effacement : on note si le compte existait encore au moment de l'envoi.
    sendDeletionEmail: mail || (async (args) => { log.mails.push({ ...args, userStillThere: store.has(String(args.email).toLowerCase()) }); }),
    log: (...a) => { log.errors.push(a.join(' ')); },
    now: () => now,
  });
  return { svc, log, store, user };
}

test('désactiver : connexion bloquée (champ disabled), date, motif et auteur gardés, journal admin ; réactiver efface tout', async () => {
  const { svc, log, user } = makeEnv();
  const out = await svc.setDisabled({ userId: ME, disabled: true, reason: ' Usage frauduleux signalé ', admin: { userId: ADMIN, name: 'Admin HARX' } });
  assert.equal(user.disabled, true);
  assert.equal(user.disabledReason, 'Usage frauduleux signalé');
  assert.equal(user.disabledBy.name, 'Admin HARX');
  assert.equal(out.disabled, true);
  assert.equal(log.audits[0].action, 'account_disabled');
  assert.equal(log.audits[0].adminId, ADMIN);

  const back = await svc.setDisabled({ userId: ME, disabled: false, admin: { userId: ADMIN, name: 'Admin HARX' } });
  assert.equal(back.disabled, false);
  assert.equal(user.disabledAt, null);
  assert.equal(user.disabledReason, null);
  assert.equal(log.audits[1].action, 'account_enabled');
});

test('désactiver : refus pour un compte protégé (démonstration Apple), un administrateur, un compte introuvable, un statut invalide', async () => {
  const apple = makeEnv({ user: makeUser({ email: 'chafik.sabiry4apple@harx.ai' }) });
  await assert.rejects(() => apple.svc.setDisabled({ userId: ME, disabled: true }), (e) => e.code === 'PROTECTED_ACCOUNT' && e.statusCode === 403);
  const admin = makeEnv({ user: makeUser({ typeUser: 'admin' }) });
  await assert.rejects(() => admin.svc.setDisabled({ userId: ME, disabled: true }), (e) => e.code === 'ADMIN_ACCOUNT');
  const none = makeEnv({ user: null });
  await assert.rejects(() => none.svc.setDisabled({ userId: ME, disabled: true }), (e) => e.code === 'USER_NOT_FOUND' && e.statusCode === 404);
  const bad = makeEnv();
  await assert.rejects(() => bad.svc.setDisabled({ userId: ME, disabled: 'yes' }), (e) => e.code === 'INVALID_STATUS');
});

// ---------- Service : supprimer ----------

test('supprimer (admin) : email retapé obligatoire, puis orchestrateur, journal sans donnée personnelle, données effacées, email libéré', async () => {
  const { svc, log, store } = makeEnv();
  await assert.rejects(() => svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'autre@exemple.fr' }), (e) => e.code === 'CONFIRMATION_MISMATCH');
  assert.equal(log.purged.length, 0, 'rien n’est lancé sans confirmation');

  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: ' Marie.Dupont@exemple.fr ' });
  assert.deepEqual(log.purged, [{ userId: ME, companyIds: [COMPANY] }]);
  assert.equal(out.numbersReturned, 1);
  assert.equal(out.subscriptionsCanceled, 1);
  assert.equal(out.emailFreed, true);
  // Journal : qui et quand, aucun email ni nom.
  const line = log.deletions[0];
  assert.deepEqual(line.actor, { type: 'admin', adminId: ADMIN });
  assert.ok(line.at instanceof Date);
  assert.ok(!JSON.stringify(line).includes('marie'), 'aucune donnée personnelle dans le journal');
  // Ordre : le journal (qui ferme aussi les jetons) avant l'effacement ; l'email n'existe plus.
  assert.equal(log.deleted.length, 1);
  assert.equal(store.has('marie.dupont@exemple.fr'), false, 'email libre pour une nouvelle inscription');
});

test('supprimer (abonné) : email ET mot de passe exacts exigés', async () => {
  const { svc, log } = makeEnv();
  await assert.rejects(() => svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'faux' }), (e) => e.code === 'INVALID_CREDENTIALS' && e.statusCode === 403);
  await assert.rejects(() => svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'x@exemple.fr', password: 'secret123' }), (e) => e.code === 'INVALID_CREDENTIALS');
  assert.equal(log.purged.length, 0);
  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'secret123' });
  assert.equal(out.emailFreed, true);
  assert.deepEqual(log.deletions[0].actor, { type: 'self' });
});

test('supprimer : échec de l’orchestrateur (Stripe, numéro) => rien n’est effacé ici, on peut recommencer', async () => {
  const { svc, log, store } = makeEnv({ purge: async () => { throw new AccountClosureError(502, 'ACCOUNT_PURGE_FAILED', 'stripe down'); } });
  await assert.rejects(() => svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' }), (e) => e.code === 'ACCOUNT_PURGE_FAILED');
  assert.equal(log.deletions.length, 0);
  assert.equal(log.deleted.length, 0);
  assert.equal(store.has('marie.dupont@exemple.fr'), true);
});

test('supprimer : refus pour un compte protégé, un administrateur, une société avec d’autres membres', async () => {
  const apple = makeEnv({ user: makeUser({ email: 'chafik.sabiry4apple@harx.ai' }) });
  await assert.rejects(() => apple.svc.deleteAccount({ userId: ME, actor: { type: 'admin' }, confirmEmail: 'chafik.sabiry4apple@harx.ai' }), (e) => e.code === 'PROTECTED_ACCOUNT');
  assert.equal(apple.log.purged.length, 0);
  const admin = makeEnv({ user: makeUser({ typeUser: 'admin' }) });
  await assert.rejects(() => admin.svc.deleteAccount({ userId: ME, actor: { type: 'admin' }, confirmEmail: 'marie.dupont@exemple.fr' }), (e) => e.code === 'ADMIN_ACCOUNT');
  const team = makeEnv({ others: 2 });
  await assert.rejects(() => team.svc.deleteAccount({ userId: ME, actor: { type: 'admin' }, confirmEmail: 'marie.dupont@exemple.fr' }), (e) => e.code === 'COMPANY_HAS_MEMBERS' && e.statusCode === 409);
  assert.equal(team.log.purged.length, 0);
});

// ---------- Appel réel à l'orchestrateur (jeton de service) ----------

test('orchestrateur : POST /api/internal/accounts/purge avec un jeton de service `account-purge` à durée courte', async () => {
  let seen = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = { url: req.url, method: req.method, auth: req.headers.authorization, body: JSON.parse(body) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { subscriptionsCanceled: ['sub_1'], numbersReturned: [] } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.COMPORCHESTRATOR_URL = `http://127.0.0.1:${server.address().port}/api`;
  const svc = createAccountClosureService({
    findUser: async () => makeUser(),
    ownedCompanyIds: async () => [COMPANY],
    otherMembersCount: async () => 0,
    recordDeletion: async () => {},
    deleteRegistrationData: async () => ({ userDeleted: true }),
  });
  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' });
  server.close();
  delete process.env.COMPORCHESTRATOR_URL;
  assert.equal(seen.method, 'POST');
  assert.equal(seen.url, '/api/internal/accounts/purge');
  assert.deepEqual(seen.body, { userId: ME, companyIds: [COMPANY] });
  const token = jwt.verify(seen.auth.split(' ')[1], 'test-secret');
  assert.equal(token.scope, ACCOUNT_PURGE_SCOPE);
  assert.equal(token.userId, undefined);
  assert.ok(token.exp - token.iat <= 120);
  assert.equal(out.subscriptionsCanceled, 1);
});

test('orchestrateur non configuré : 503 ACCOUNT_PURGE_NOT_CONFIGURED, rien n’est effacé', async () => {
  delete process.env.COMPORCHESTRATOR_URL;
  delete process.env.RAILWAY_SERVICE_V25_COMPORCHESTRATOR_BACK_URL;
  let deleted = false;
  const svc = createAccountClosureService({
    findUser: async () => makeUser(),
    ownedCompanyIds: async () => [],
    otherMembersCount: async () => 0,
    deleteRegistrationData: async () => { deleted = true; },
  });
  await assert.rejects(() => svc.deleteAccount({ userId: ME, actor: { type: 'admin' }, confirmEmail: 'marie.dupont@exemple.fr' }), (e) => e.code === 'ACCOUNT_PURGE_NOT_CONFIGURED' && e.statusCode === 503);
  assert.equal(deleted, false);
  assert.equal(orchestratorOrigin({ RAILWAY_SERVICE_V25_COMPORCHESTRATOR_BACK_URL: 'orch.up.railway.app' }), 'https://orch.up.railway.app');
});

// ---------- Routes ----------

test('routes : admin seulement (authenticate + requireAdmin) ; suppression par l’abonné : son propre compte seulement', async () => {
  const find = (router, path, method) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  const status = find(adminRoutes, '/users/:userId/status', 'patch');
  const del = find(adminRoutes, '/users/:userId', 'delete');
  assert.ok(status && del);
  for (const layer of [status, del]) {
    const handles = layer.route.stack.map((s) => s.handle);
    assert.equal(handles[0], authenticate);
    assert.equal(handles[1], requireAdmin);
  }
  assert.equal(status.route.stack[2].handle, adminUserStatus);
  assert.equal(del.route.stack[2].handle, adminDeleteUser);
  const self = find(userRoutes, '/:userId/delete-account', 'post');
  assert.ok(self);
  assert.equal(self.route.stack.at(-1).handle, deleteOwnAccount);

  gate.setAccountGateLookup(async () => 'active');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api/users', userRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, auth, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const company = bearer({ userId: ME, typeUser: 'company' });
  assert.equal((await call('PATCH', `/api/admin/users/${ME}/status`, null, { disabled: true })).status, 401);
  assert.equal((await call('PATCH', `/api/admin/users/${ME}/status`, company, { disabled: true })).status, 403);
  assert.equal((await call('DELETE', `/api/admin/users/${ME}`, company, { confirmEmail: 'x' })).status, 403);
  // Un abonné ne supprime jamais le compte d'un autre.
  assert.equal((await call('POST', `/api/users/${ADMIN}/delete-account`, company, { email: 'x', password: 'y' })).status, 403);
  server.close();
  gate.setAccountGateLookup(null);
});

// ---------- E-mail de confirmation de la suppression ----------

const { accountDeletedEmail } = await import('../utils/harxMessages.js');

test('e-mail de confirmation : envoyé à l’adresse supprimée APRÈS la suppression réussie, avec le numéro ; drapeau confirmationEmailSent', async () => {
  const { svc, log } = makeEnv();
  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'secret123' });
  assert.equal(out.confirmationEmailSent, true);
  assert.equal(log.mails.length, 1);
  assert.equal(log.mails[0].email, 'marie.dupont@exemple.fr');
  assert.deepEqual(log.mails[0].numbers, ['+33142000007']);
  assert.equal(log.mails[0].byAdmin, false);
  assert.equal(log.mails[0].userStillThere, false, 'le compte est déjà effacé quand l’e-mail part');
  assert.equal(log.deleted.length, 1);
});

test('e-mail de confirmation : suppression par l’admin => envoyé aussi, formulation « par l’équipe HARX »', async () => {
  const { svc, log } = makeEnv();
  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' });
  assert.equal(out.confirmationEmailSent, true);
  assert.equal(log.mails[0].byAdmin, true);
  const m = accountDeletedEmail({ email: 'marie.dupont@exemple.fr', numbers: ['+33142000007'], byAdmin: true, product: 'nomad' });
  assert.equal(m.subject, 'Votre compte HARX NOMAD a été supprimé');
  assert.match(m.text, /Votre compte a été supprimé par l'équipe HARX/);
  assert.match(m.html, /Votre compte a été supprimé par l&#39;équipe HARX|Votre compte a été supprimé par l'équipe HARX/);
});

test('e-mail de confirmation : échec d’envoi => la suppression réussit quand même, erreur journalisée sans donnée personnelle, drapeau false', async () => {
  const { svc, log, store } = makeEnv({ mail: async () => { throw new Error('Brevo: down'); } });
  const out = await svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'secret123' });
  assert.equal(out.confirmationEmailSent, false);
  assert.equal(out.emailFreed, true);
  assert.equal(store.has('marie.dupont@exemple.fr'), false, 'compte bien supprimé');
  assert.equal(log.errors.length, 1);
  assert.match(log.errors[0], /Brevo: down/);
  assert.ok(!log.errors[0].includes('marie'), 'aucun email dans le journal');
});

test('e-mail de confirmation : jamais envoyé si la suppression échoue (mauvais mot de passe, orchestrateur en panne)', async () => {
  const bad = makeEnv();
  await assert.rejects(() => bad.svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'faux' }));
  assert.equal(bad.log.mails.length, 0);
  const down = makeEnv({ purge: async () => { throw new AccountClosureError(502, 'ACCOUNT_PURGE_FAILED', 'stripe down'); } });
  await assert.rejects(() => down.svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' }));
  assert.equal(down.log.mails.length, 0);
});

test('e-mail de confirmation : récapitulatif (abonnement, numéro, données, e-mail libéré), aucun lien, contenu échappé', () => {
  const m = accountDeletedEmail({ email: 'marie.dupont@exemple.fr', numbers: ['+33142000007'], product: 'nomad' });
  assert.equal(m.subject, 'Votre compte HARX NOMAD a été supprimé');
  assert.match(m.text, /Votre compte a été supprimé\n/);
  assert.match(m.text, /Votre abonnement est arrêté — plus aucun prélèvement/);
  assert.match(m.text, /Votre numéro \+33 1 42 00 00 07 est libéré/);
  assert.match(m.text, /Vos données sont effacées \(contacts, journal d'appels, messages, pièces d'identité, minutes et jetons\)/);
  assert.match(m.text, /Votre e-mail marie\.dupont@exemple\.fr est libéré : vous pouvez créer un nouveau compte avec cette adresse/);
  assert.ok(!/<a\s/i.test(m.html), 'aucun lien (le compte n’existe plus)');
  const x = accountDeletedEmail({ email: '<b>x</b>@e.fr', numbers: [] });
  assert.ok(!x.html.includes('<b>x</b>'));
  assert.match(x.text, /Votre numéro est libéré/);
});

test('réponse HTTP : POST /delete-account renvoie data.confirmationEmailSent', async () => {
  const { svc } = makeEnv({ mail: async () => { throw new Error('smtp down'); } });
  const original = (await import('../services/accountClosureService.js')).accountClosureService;
  const saved = original.deleteAccount;
  original.deleteAccount = (args) => svc.deleteAccount(args);
  const res = fakeRes();
  await deleteOwnAccount({ params: { userId: ME }, body: { email: 'marie.dupont@exemple.fr', password: 'secret123' } }, res);
  original.deleteAccount = saved;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.confirmationEmailSent, false);
  assert.equal(res.body.data.emailFreed, true);
});

// ---------- Offre du compte dans l'e-mail (NOMAD / CLOUD / neutre), jamais de mélange ----------

test('e-mail par offre : NOMAD, CLOUD, ou neutre « HARX » si l’offre est inconnue', () => {
  const nomad = accountDeletedEmail({ email: 'a@b.fr', numbers: [], product: 'nomad' });
  assert.equal(nomad.subject, 'Votre compte HARX NOMAD a été supprimé');
  assert.match(nomad.html, /NOMAD · COMPTE SUPPRIMÉ/);
  assert.ok(!/CLOUD/.test(nomad.html + nomad.text));

  const cloud = accountDeletedEmail({ email: 'a@b.fr', numbers: [], product: 'cloud', byAdmin: true });
  assert.equal(cloud.subject, 'Votre compte HARX CLOUD a été supprimé');
  assert.match(cloud.text, /^HARX CLOUD\n/);
  assert.match(cloud.text, /L'équipe HARX a supprimé votre compte HARX CLOUD\./);
  assert.match(cloud.html, /CLOUD · COMPTE SUPPRIMÉ/);
  assert.ok(!/NOMAD/.test(cloud.html + cloud.text + cloud.subject), 'aucune mention NOMAD dans un e-mail CLOUD');

  for (const product of [null, undefined, 'taas', 'NOMAD ', '']) {
    const neutral = accountDeletedEmail({ email: 'a@b.fr', numbers: [], product });
    assert.equal(neutral.subject, 'Votre compte HARX a été supprimé', String(product));
    assert.ok(!/NOMAD|CLOUD/.test(neutral.html + neutral.text), String(product));
  }
});

test('abonné : l’offre envoyée par le portail (nomad | cloud) est reprise, sans relecture', async () => {
  const { svc, log } = makeEnv({ product: async () => 'nomad' });
  await svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'secret123', product: 'cloud' });
  assert.equal(log.mails[0].product, 'cloud');
  assert.ok(!log.steps.includes('product'));
});

test('abonné sans offre (ou offre inconnue) : offre lue côté serveur, avant la purge', async () => {
  for (const sent of [undefined, 'taas']) {
    const { svc, log } = makeEnv({ product: async () => 'nomad' });
    await svc.deleteAccount({ userId: ME, actor: { type: 'self' }, email: 'marie.dupont@exemple.fr', password: 'secret123', product: sent });
    assert.equal(log.mails[0].product, 'nomad', String(sent));
    assert.deepEqual(log.steps, ['product', 'purge'], 'lue avant la purge (l’abonnement est effacé ensuite)');
  }
});

test('admin : offre lue depuis la société avant la purge (l’offre envoyée est ignorée) ; CLOUD => e-mail CLOUD', async () => {
  const { svc, log } = makeEnv({ product: async ({ companyIds }) => (companyIds[0] === COMPANY ? 'cloud' : null) });
  await svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr', product: 'nomad' });
  assert.equal(log.mails[0].product, 'cloud');
  assert.equal(log.mails[0].byAdmin, true);
  assert.deepEqual(log.steps, ['product', 'purge']);
});

test('admin : offre introuvable ou lecture en échec => e-mail neutre, la suppression réussit', async () => {
  const none = makeEnv({ product: async () => null });
  await none.svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' });
  assert.equal(none.log.mails[0].product, null);

  const broken = makeEnv({ product: async () => { throw new Error('db down'); } });
  const out = await broken.svc.deleteAccount({ userId: ME, actor: { type: 'admin', userId: ADMIN }, confirmEmail: 'marie.dupont@exemple.fr' });
  assert.equal(out.emailFreed, true);
  assert.equal(out.confirmationEmailSent, true);
  assert.equal(broken.log.mails[0].product, null);
  assert.match(broken.log.errors[0], /offre du compte non lue/);
  assert.ok(!broken.log.errors[0].includes('marie'));
});

test('route abonné : le champ `product` du corps est transmis au service', async () => {
  const original = (await import('../services/accountClosureService.js')).accountClosureService;
  const saved = original.deleteAccount;
  let got = null;
  original.deleteAccount = async (args) => { got = args; return { emailFreed: true, confirmationEmailSent: true }; };
  const res = fakeRes();
  await deleteOwnAccount({ params: { userId: ME }, body: { email: 'a@b.fr', password: 'x', product: 'cloud' } }, res);
  original.deleteAccount = saved;
  assert.equal(got.product, 'cloud');
  assert.deepEqual(got.actor, { type: 'self' });
});

test('offre lue côté serveur : palier de l’abonnement d’abord (Nomad Solo = NOMAD, autres = CLOUD), sinon profil du portail, sinon null', async () => {
  const { resolveAccountOffer } = await import('../services/accountClosureService.js');
  const states = (rows) => async () => rows;
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => 'nomad_solo', workspaceStates: states([]) }), 'nomad');
  for (const tier of ['accueil', 'full_scope', 'multi_clients']) {
    assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => tier, workspaceStates: states([{ data: { accountProfile: 'solo' } }]) }), 'cloud', tier);
  }
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: { accountProfile: 'solo' } }]) }), 'nomad');
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: { accountProfile: 'company' } }]) }), 'cloud');
  assert.equal(await resolveAccountOffer({ companyIds: ['c1'], lastKnownTier: async () => null, workspaceStates: states([{ data: {} }]) }), null);
  assert.equal(await resolveAccountOffer({ companyIds: [], lastKnownTier: async () => 'nomad_solo', workspaceStates: states([]) }), null);
});
