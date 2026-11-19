import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret';
const { authenticate, requireSelf } = await import('../middleware/auth.js');
const { createEmailChangeService, EmailChangeError, MAX_CODE_ATTEMPTS, REQUEST_LIMIT, REQUEST_WINDOW_MS } =
  await import('../services/emailChangeService.js');
const userRoutes = (await import('../routes/userRoutes.js')).default;

function fakeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
function runMiddlewares(handlers, req) {
  const res = fakeRes();
  let reached = false;
  const step = (i) => {
    if (i >= handlers.length) { reached = true; return; }
    let nextCalled = false;
    handlers[i](req, res, () => { nextCalled = true; });
    if (nextCalled) step(i + 1);
  };
  step(0);
  return { res, reached };
}
const bearer = (payload) => ({ headers: { authorization: `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}` }, params: { userId: 'u1' }, path: '/u1/email/request-change' });

// --- Routes : authenticate + requireSelf appliqués dans cet ordre aux deux routes e-mail
for (const path of ['/:userId/email/request-change', '/:userId/email/confirm-change']) {
  const layer = userRoutes.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} présente`);
  const names = layer.route.stack.map((s) => s.handle);
  assert.equal(names[0], authenticate, `${path} : authenticate en premier`);
  assert.equal(names[1], requireSelf, `${path} : requireSelf ensuite`);
}

// --- Non authentifié -> 401 ; jeton invalide -> 401
let r = runMiddlewares([authenticate, requireSelf], { headers: {}, params: { userId: 'u1' }, path: '/u1/email/request-change' });
assert.equal(r.res.statusCode, 401); assert.equal(r.reached, false);
r = runMiddlewares([authenticate, requireSelf], { headers: { authorization: 'Bearer nope' }, params: { userId: 'u1' }, path: '/x' });
assert.equal(r.res.statusCode, 401);

// --- Autre utilisateur -> 403 forbidden
r = runMiddlewares([authenticate, requireSelf], bearer({ userId: 'u2' }));
assert.equal(r.res.statusCode, 403); assert.equal(r.res.body.code, 'forbidden'); assert.equal(r.res.body.success, false); assert.equal(r.reached, false);

// --- Propriétaire -> passe ; mustChangePassword -> bloqué par le middleware existant
r = runMiddlewares([authenticate, requireSelf], bearer({ userId: 'u1' }));
assert.equal(r.reached, true);
r = runMiddlewares([authenticate, requireSelf], bearer({ userId: 'u1', mustChangePassword: true }));
assert.equal(r.res.statusCode, 403); assert.equal(r.reached, false);

// --- Service avec dépendances simulées
function makeEnv({ password = 'secret123', email = 'old@x.fr', others = [] } = {}) {
  const hash = password ? bcrypt.hashSync(password, 4) : undefined;
  const user = {
    _id: 'u1', email, fullName: 'Ada', phone: '0102', password: hash, pendingChanges: {},
    async comparePassword(p) { return hash ? bcrypt.compare(p, hash) : false; },
    async save() { this.saves = (this.saves || 0) + 1; },
  };
  const env = { user, sent: [], notices: [], clock: 1_000_000, others: [...others] };
  env.svc = createEmailChangeService({
    findUserById: async (id) => (id === 'u1' ? user : null),
    findUserByEmail: async (e) => (env.others.includes(e) ? { _id: 'other' } : null),
    sendVerificationEmail: async (e, c) => { env.sent.push({ e, c }); },
    sendEmailChangedNotice: async (o, n) => { env.notices.push({ o, n }); },
    signToken: (u) => jwt.sign({ userId: u._id, email: u.email }, process.env.JWT_SECRET),
    now: () => env.clock,
  });
  return env;
}
const fails = async (p, status, code) => {
  await assert.rejects(p, (e) => e instanceof EmailChangeError && e.status === status && e.code === code, `${status} ${code}`);
};

// Mauvais mot de passe / absent -> 401 invalid_password, rien d'envoyé
let env = makeEnv();
await fails(env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'faux' }), 401, 'invalid_password');
await fails(env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr' }), 401, 'invalid_password');
assert.equal(env.sent.length, 0);

// Bon flux, e-mail normalisé en minuscules, token renvoyé, notification à l'ancien e-mail
env = makeEnv();
await env.svc.requestEmailChange('u1', { newEmail: '  New@X.fr ', currentPassword: 'secret123' });
assert.equal(env.sent.length, 1);
assert.equal(env.sent[0].e, 'new@x.fr');
assert.match(env.sent[0].c, /^\d{6}$/);
const out = await env.svc.confirmEmailChange('u1', { code: env.sent[0].c });
assert.equal(out.success, true);
assert.equal(out.data.email, 'new@x.fr');
assert.equal(env.user.email, 'new@x.fr');
assert.equal(jwt.verify(out.data.token, process.env.JWT_SECRET).email, 'new@x.fr');
assert.deepEqual(env.notices, [{ o: 'old@x.fr', n: 'new@x.fr' }]);
assert.equal(env.user.pendingChanges.emailChange, undefined);

// Compte sans mot de passe (LinkedIn) : non exigé
env = makeEnv({ password: null });
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr' });
assert.equal(env.sent.length, 1);

// E-mail identique, invalide, déjà utilisé
env = makeEnv();
await fails(env.svc.requestEmailChange('u1', { newEmail: 'OLD@x.fr', currentPassword: 'secret123' }), 400, 'same_email');
await fails(env.svc.requestEmailChange('u1', { newEmail: 'pas-un-mail', currentPassword: 'secret123' }), 400, 'invalid_email');
env.others.push('pris@x.fr');
await fails(env.svc.requestEmailChange('u1', { newEmail: 'Pris@x.fr', currentPassword: 'secret123' }), 409, 'email_taken');
assert.equal(env.sent.length, 0);

// Utilisateur inconnu
await fails(env.svc.requestEmailChange('nope', { newEmail: 'a@b.fr' }), 404, 'user_not_found');

// Limitation de fréquence : 5 demandes / heure / utilisateur, puis fenêtre glissante
env = makeEnv();
for (let i = 0; i < REQUEST_LIMIT; i++) await env.svc.requestEmailChange('u1', { newEmail: `n${i}@x.fr`, currentPassword: 'secret123' });
await fails(env.svc.requestEmailChange('u1', { newEmail: 'z@x.fr', currentPassword: 'secret123' }), 429, 'rate_limited');
env.clock += REQUEST_WINDOW_MS + 1;
await env.svc.requestEmailChange('u1', { newEmail: 'z@x.fr', currentPassword: 'secret123' });

// Code erroné, puis invalidation après MAX_CODE_ATTEMPTS essais
env = makeEnv();
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'secret123' });
const good = env.sent[0].c;
const bad = good === '000000' ? '111111' : '000000';
for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) await fails(env.svc.confirmEmailChange('u1', { code: bad }), 401, 'invalid_code');
await fails(env.svc.confirmEmailChange('u1', { code: bad }), 429, 'too_many_attempts');
await fails(env.svc.confirmEmailChange('u1', { code: good }), 400, 'no_pending_change'); // même le bon code est invalidé
assert.equal(env.user.email, 'old@x.fr');

// Bon code après quelques erreurs (sous la limite)
env = makeEnv();
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'secret123' });
await fails(env.svc.confirmEmailChange('u1', { code: '12' }), 401, 'invalid_code');
assert.equal((await env.svc.confirmEmailChange('u1', { code: env.sent[0].c })).data.email, 'new@x.fr');

// Code expiré (15 min)
env = makeEnv();
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'secret123' });
env.clock += 15 * 60 * 1000 + 1;
await fails(env.svc.confirmEmailChange('u1', { code: env.sent[0].c }), 400, 'code_expired');
assert.equal(env.user.email, 'old@x.fr');

// Sans demande en cours / sans code
env = makeEnv();
await fails(env.svc.confirmEmailChange('u1', { code: '123456' }), 400, 'no_pending_change');
await fails(env.svc.confirmEmailChange('u1', {}), 400, 'invalid_code');

// E-mail pris entre-temps : refusé à la confirmation
env = makeEnv();
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'secret123' });
env.others.push('new@x.fr');
await fails(env.svc.confirmEmailChange('u1', { code: env.sent[0].c }), 409, 'email_taken');
assert.equal(env.user.email, 'old@x.fr');

// Échec d'envoi de la notification : le changement aboutit quand même
env = makeEnv();
env.svc = createEmailChangeService({
  findUserById: async () => env.user, findUserByEmail: async () => null,
  sendVerificationEmail: async (e, c) => { env.sent.push({ e, c }); },
  sendEmailChangedNotice: async () => { throw new Error('smtp'); },
  signToken: () => 't', now: () => env.clock,
});
await env.svc.requestEmailChange('u1', { newEmail: 'new@x.fr', currentPassword: 'secret123' });
assert.equal((await env.svc.confirmEmailChange('u1', { code: env.sent[0].c })).data.token, 't');

console.log('emailChange OK');
