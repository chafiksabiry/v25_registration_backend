/**
 * Sensitive routes of the registration service: 401 without a token, 403 on another account, public routes
 * (sign-up, sign-in, verification, password reset, signed webhooks, health) still reachable without a token.
 * Services are stubbed: the tests check the guards in front of the controllers, through the real route files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
delete process.env.AUTH_USERID_FALLBACK;

const authService = (await import('../services/authService.js')).default;
const userService = (await import('../services/userService.js')).default;
const userRoutes = (await import('../routes/userRoutes.js')).default;
const authRoutes = (await import('../routes/authRoutes.js')).default;
const companyMemberRoutes = (await import('../routes/companyMemberRoutes.js')).default;
const { authenticate } = await import('../middleware/auth.js');
const { authenticateCallCenter } = await import('../middleware/callCenterAuth.js');

const ME = '64b0000000000000000000a1';
const OTHER = '64b0000000000000000000b2';
const typeOf = { [ME]: 'company', [OTHER]: null };

// Stubs: no database.
userService.getUserDetails = async (id) => ({ _id: id, fullName: 'X', email: 'x@harx.ai' });
userService.getUserIPHistory = async () => [];
authService.checkUserType = async () => ({ userType: 'company', employerCompanyId: 'c1', product: 'callcentre', mustChangePassword: false });
authService.currentUserType = async (id) => (id in typeOf ? typeOf[id] : undefined);
authService.changeUserType = async (id, t) => ({ success: true, message: `User type changed to ${t}` });
authService.checkFirstLogin = async () => ({ isFirstLogin: false });
authService.verifyAccount = async () => ({ success: true });

const sign = (payload, secret = 'test-secret') => `Bearer ${jwt.sign(payload, secret)}`;
const mine = sign({ userId: ME, typeUser: 'company' });
const admin = sign({ userId: '64b000000000000000000077', typeUser: 'admin' });
const service = (scope) => sign({ scope });

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.status(200).json({ status: 'OK' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/company-members', companyMemberRoutes);
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const ACCOUNT_ROUTES = [
  ['GET', `/api/users/${OTHER}`],
  ['PATCH', `/api/users/${OTHER}`, { fullName: 'Pirate' }],
  ['GET', `/api/users/${OTHER}/ip-history`],
  ['POST', `/api/users/${OTHER}/password/request-change`],
  ['POST', `/api/users/${OTHER}/password/confirm-change`, { code: '1', newPassword: 'x' }],
  ['POST', `/api/users/${OTHER}/phone/request-change`, { newPhone: '+33600000000' }],
  ['POST', `/api/users/${OTHER}/phone/confirm-change`, { otp: '1' }],
  ['POST', `/api/users/${OTHER}/change-password`, { code: '1', newPassword: 'x' }],
  ['POST', `/api/users/${OTHER}/email/request-change`, { newEmail: 'a@b.c' }],
  ['POST', `/api/users/${OTHER}/email/confirm-change`, { code: '1' }],
  ['POST', '/api/auth/verify-account', { userId: OTHER }],
  ['POST', '/api/auth/check-first-login', { userId: OTHER }],
];

test('401 without a token on every account route', async () => {
  for (const [method, path, body] of ACCOUNT_ROUTES) {
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path}`);
  }
  assert.equal((await call('POST', '/api/auth/send-verification-email', { body: { email: 'a@b.c', code: '1' } })).status, 401);
});

test('a token signed with another secret (e.g. the old "your-secret-key" fallback) is refused', async () => {
  const forged = sign({ userId: OTHER, typeUser: 'admin' }, 'your-secret-key');
  assert.equal((await call('GET', `/api/users/${OTHER}`, { auth: forged })).status, 401);
});

test('403 on another account', async () => {
  for (const [method, path, body] of ACCOUNT_ROUTES) {
    assert.equal((await call(method, path, { auth: mine, body })).status, 403, `${method} ${path}`);
  }
  assert.equal((await call('POST', '/api/auth/send-verification-email', { auth: mine, body: { email: 'a@b.c', code: '1' } })).status, 403);
});

test('the account itself passes', async () => {
  assert.equal((await call('GET', `/api/users/${ME}`, { auth: mine })).status, 200);
  assert.equal((await call('GET', `/api/users/${ME}/ip-history`, { auth: mine })).status, 200);
  assert.equal((await call('POST', '/api/auth/check-first-login', { auth: mine, body: { userId: ME } })).status, 200);
  assert.equal((await call('POST', '/api/auth/verify-account', { auth: mine, body: { userId: ME } })).status, 200);
});

test('an admin and a backend with the user-read scope can read an account; other scopes cannot', async () => {
  assert.equal((await call('GET', `/api/users/${OTHER}`, { auth: admin })).status, 200);
  assert.equal((await call('GET', `/api/users/${OTHER}`, { auth: service('registration-user-read') })).status, 200);
  assert.equal((await call('GET', `/api/users/${OTHER}`, { auth: service('kb-read') })).status, 401);
  assert.equal((await call('PATCH', `/api/users/${OTHER}`, { auth: service('registration-user-read'), body: { fullName: 'x' } })).status, 401);
});

test('change-user-type: no switch of an existing account without its token', async () => {
  // anonymous, account already typed -> refused
  assert.equal((await call('POST', '/api/auth/change-user-type', { body: { userId: ME, newType: 'rep' } })).status, 401);
  // another signed-in account -> refused
  assert.equal((await call('POST', '/api/auth/change-user-type', { auth: sign({ userId: OTHER }), body: { userId: ME, newType: 'rep' } })).status, 403);
  // right after sign-up: first choice of a type, no token yet -> allowed
  assert.equal((await call('POST', '/api/auth/change-user-type', { body: { userId: OTHER, newType: 'company' } })).status, 200);
  // the account itself -> allowed
  assert.equal((await call('POST', '/api/auth/change-user-type', { auth: mine, body: { userId: ME, newType: 'call-center' } })).status, 200);
  // unknown account
  assert.equal((await call('POST', '/api/auth/change-user-type', { body: { userId: '64b0000000000000000000ff', newType: 'rep' } })).status, 404);
});

test('check-user-type: anonymous callers only learn the type', async () => {
  const anon = await call('POST', '/api/auth/check-user-type', { body: { userId: ME } });
  assert.equal(anon.status, 200);
  assert.deepEqual(anon.body, { userType: 'company' });
  const other = await call('POST', '/api/auth/check-user-type', { auth: sign({ userId: OTHER }), body: { userId: ME } });
  assert.deepEqual(other.body, { userType: 'company' });
  const self = await call('POST', '/api/auth/check-user-type', { auth: mine, body: { userId: ME } });
  assert.equal(self.body.employerCompanyId, 'c1');
  assert.equal(self.body.product, 'callcentre');
});

test('team routes: a bare userId without a token no longer authenticates', async () => {
  const r = await call('GET', `/api/company-members/me?userId=${ME}`, { auth: undefined });
  assert.equal(r.status, 401);
  const viaHeader = await fetch(`${base}/api/company-members/me`, { headers: { 'X-User-Id': ME } });
  assert.equal(viaHeader.status, 401);
});

test('AUTH_USERID_FALLBACK=allow re-enables the old fallback (temporary escape hatch)', () => {
  process.env.AUTH_USERID_FALLBACK = 'allow';
  try {
    let passed = false;
    const req = { headers: { 'x-user-id': ME }, query: {}, body: {}, method: 'GET', originalUrl: '/x' };
    const res = { status() { return this; }, json() { return this; } };
    authenticateCallCenter(req, res, () => { passed = true; });
    assert.equal(passed, true);
    assert.equal(req.user.userId, ME);
  } finally {
    delete process.env.AUTH_USERID_FALLBACK;
  }
});

test('without JWT_SECRET protected requests are refused with a clear message', async () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const r = await call('GET', `/api/users/${ME}`, { auth: mine });
    assert.equal(r.status, 500);
    assert.match(r.body.message, /JWT_SECRET/);
    const team = await call('GET', '/api/company-members/me', { auth: mine });
    assert.equal(team.status, 500);
  } finally {
    process.env.JWT_SECRET = saved;
  }
});

test('public routes carry no authentication middleware', () => {
  const PUBLIC = ['/register', '/check-email', '/check-phone', '/login', '/verify-email', '/reengage-login', '/invite-login',
    '/reengage-request', '/linkedin', '/signin/linkedin', '/send-otp', '/verify-otp', '/generate-verification-code', '/resend-verification'];
  for (const path of PUBLIC) {
    const layer = authRoutes.stack.find((l) => l.route?.path === path);
    assert.ok(layer, `route ${path} présente`);
    assert.ok(!layer.route.stack.some((s) => s.handle === authenticate), `${path} reste publique`);
  }
});

test('health stays public', async () => {
  assert.equal((await call('GET', '/')).status, 200);
});
