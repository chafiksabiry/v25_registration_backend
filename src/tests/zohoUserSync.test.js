import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createZohoWebhookRouter } from '../routes/zohoWebhookRoutes.js';
import { normalizePayload, buildUserDoc } from '../controllers/zohoUserSyncController.js';

const SECRET = 'a'.repeat(32);

/** Fausse collection avec la sémantique d'un upsert sur index unique (email). */
function fakeUsers(seed = []) {
  const docs = seed.map((d) => ({ ...d }));
  return {
    docs,
    calls: 0,
    async updateOne(filter, update, options) {
      this.calls += 1;
      assert.deepEqual(Object.keys(update), ['$setOnInsert'], "seul \$setOnInsert est autorisé : aucune modification d'un existant");
      assert.equal(options.upsert, true);
      const found = docs.find((d) => d.email === filter.email);
      if (found) return { upsertedCount: 0, modifiedCount: 0 };
      docs.push({ email: filter.email, ...update.$setOnInsert });
      return { upsertedCount: 1, modifiedCount: 0 };
    },
  };
}

async function withServer(opts, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/zoho', createZohoWebhookRouter({ getSecret: () => SECRET, now: () => new Date('2026-11-15T07:00:00Z'), ...opts }));
  app.use((err, _req, res, _next) => res.status(500).json({ ok: false, error: 'internal' }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/zoho/sync-user`;
  try { await fn((body, headers = { 'x-zoho-webhook-token': SECRET }, type = 'json') => fetch(base, {
    method: 'POST',
    headers: { 'content-type': type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', ...headers },
    body: type === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  })); } finally { await new Promise((r) => server.close(r)); }
}

test('authentification : sans jeton, mauvais jeton ou secret absent => aucune écriture', async () => {
  const users = fakeUsers();
  await withServer({ getCollection: async () => users }, async (post) => {
    assert.equal((await post({ email: 'alice@example.org' }, {})).status, 401);
    assert.equal((await post({ email: 'alice@example.org' }, { 'x-zoho-webhook-token': 'mauvais' })).status, 401);
    assert.equal((await post({ email: 'alice@example.org' }, { authorization: `Bearer ${SECRET}` })).status, 200);
  });
  assert.equal(users.docs.length, 1);
  const u2 = fakeUsers();
  await withServer({ getCollection: async () => u2, getSecret: () => '' }, async (post) => {
    assert.equal((await post({ email: 'bob@example.org' })).status, 503);
  });
  const u3 = fakeUsers();
  await withServer({ getCollection: async () => u3, getSecret: () => 'trop-court' }, async (post) => {
    assert.equal((await post({ email: 'bob@example.org' }, { 'x-zoho-webhook-token': 'trop-court' })).status, 503);
  });
  assert.equal(u2.calls + u3.calls, 0);
});

test('création : nouvel utilisateur ajouté avec la convention des imports (sans mot de passe)', async () => {
  const users = fakeUsers();
  await withServer({ getCollection: async () => users }, async (post) => {
    const r = await post({ email: 'Alice.Martin@Example.org ', first_name: 'Alice', last_name: 'Martin', phone: '+33612345678' });
    assert.deepEqual(await r.json(), { ok: true, status: 'created' });
  });
  assert.equal(users.docs.length, 1);
  const d = users.docs[0];
  assert.equal(d.email, 'alice.martin@example.org');
  assert.equal(d.fullName, 'Alice Martin');
  assert.equal(d.phone, '+33612345678');
  assert.equal(d.password, null);
  assert.equal(d.typeUser, 'rep');
  assert.equal(d.isVerified, false);
  assert.equal(d.firstTime, true);
  assert.equal(d.source, 'zoho_crm_sync');
  assert.equal(d.importBatch, 'zoho-webhook-2026-11');
});

test('existant : aucun doublon et aucune modification, même appelé deux fois', async () => {
  const users = fakeUsers([{ email: 'alice@example.org', fullName: 'Nom existant', phone: '+33600000000', password: 'hash' }]);
  await withServer({ getCollection: async () => users }, async (post) => {
    for (let i = 0; i < 2; i += 1) {
      const r = await post({ email: 'ALICE@example.org', first_name: 'Autre', last_name: 'Nom', phone: '+33699999999' });
      assert.deepEqual(await r.json(), { ok: true, status: 'exists' });
    }
  });
  assert.equal(users.docs.length, 1);
  assert.equal(users.docs[0].fullName, 'Nom existant');
  assert.equal(users.docs[0].phone, '+33600000000');
  assert.equal(users.docs[0].password, 'hash');
});

test('appels simultanés pour la même adresse : un seul compte', async () => {
  const users = fakeUsers();
  await withServer({ getCollection: async () => users }, async (post) => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => post({ email: 'zoe@example.org' })));
    const statuses = (await Promise.all(rs.map((r) => r.json()))).map((b) => b.status).sort();
    assert.deepEqual(statuses, ['created', ...Array(9).fill('exists')].sort());
  });
  assert.equal(users.docs.length, 1);
});

test('course sur l\'index unique (E11000) : traité comme existant, pas d\'erreur', async () => {
  const users = { async updateOne() { const e = new Error('dup'); e.code = 11000; throw e; } };
  await withServer({ getCollection: async () => users }, async (post) => {
    assert.deepEqual(await (await post({ email: 'zoe@example.org' })).json(), { ok: true, status: 'exists' });
  });
});

test('adresses invalides ou suspectes : rien n\'est écrit', async () => {
  const users = fakeUsers();
  await withServer({ getCollection: async () => users }, async (post) => {
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ email: 'pas-un-email' })).status, 400);
    for (const email of ['x@gmai.com', 'kkk@gmail.com', 'ab@gmail.com', 'user@gmail.co']) {
      const r = await post({ email });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).status, 'skipped', email);
    }
  });
  assert.equal(users.calls, 0);
  assert.equal(users.docs.length, 0);
});

test('formulaire (application/x-www-form-urlencoded) accepté', async () => {
  const users = fakeUsers();
  await withServer({ getCollection: async () => users }, async (post) => {
    const r = await post({ email: 'form@example.org', first_name: 'Fa', last_name: 'Orm' }, undefined, 'form');
    assert.equal((await r.json()).status, 'created');
  });
  assert.equal(users.docs[0].fullName, 'Fa Orm');
});

test('noms : les valeurs vides ou "NONE" de Zoho ne deviennent jamais un nom', () => {
  assert.equal(normalizePayload({ email: 'jean.dupont@example.org', Last_Name: 'NONE' }).fullName, 'jean.dupont');
  assert.equal(normalizePayload({ email: 'a@b.co', First_Name: 'Jean', Last_Name: 'none' }).fullName, 'Jean');
  assert.equal(normalizePayload({ email: 'a@b.co', phone: '  ' }).phone, null);
  const doc = buildUserDoc({ fullName: 'X', phone: null }, { newUserType: 'rep', now: new Date('2026-01-02T00:00:00Z'), batchPrefix: 'p' });
  assert.equal(doc.importBatch, 'p-2026-01');
});

test('paramètres dans l\'URL (Zoho sans corps) acceptés ; le corps l\'emporte sur l\'URL', async () => {
  const users = fakeUsers();
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/zoho', createZohoWebhookRouter({ getSecret: () => SECRET, getCollection: async () => users, now: () => new Date('2026-11-15T07:00:00Z') }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/zoho/sync-user`;
  try {
    const q = new URLSearchParams({ email: 'Query.User@Example.org', first_name: 'Query', last_name: 'User' });
    const r1 = await fetch(`${base}?${q}`, { method: 'POST', headers: { 'x-zoho-webhook-token': SECRET } });
    assert.deepEqual(await r1.json(), { ok: true, status: 'created' });
    const r2 = await fetch(`${base}?email=ignore@example.org`, {
      method: 'POST',
      headers: { 'x-zoho-webhook-token': SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'body.wins@example.org' }),
    });
    assert.deepEqual(await r2.json(), { ok: true, status: 'created' });
    const r3 = await fetch(`${base}?email=a@example.org&email=b@example.org`, { method: 'POST', headers: { 'x-zoho-webhook-token': SECRET } });
    assert.equal(r3.status, 400);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(users.docs.map((d) => d.email).sort(), ['body.wins@example.org', 'query.user@example.org']);
  assert.equal(users.docs.find((d) => d.email === 'query.user@example.org').fullName, 'Query User');
});

test('secret transmis comme paramètre `token` (Zoho sans en-tête) : accepté s\'il est bon, refusé sinon', async () => {
  const users = fakeUsers();
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/zoho', createZohoWebhookRouter({ getSecret: () => SECRET, getCollection: async () => users, now: () => new Date('2026-11-15T07:00:00Z') }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/zoho/sync-user`;
  try {
    const ok = await fetch(`${base}?token=${SECRET}&email=param.token@example.org`, { method: 'POST' });
    assert.deepEqual(await ok.json(), { ok: true, status: 'created' });
    const bad = await fetch(`${base}?token=mauvais&email=nope@example.org`, { method: 'POST' });
    assert.equal(bad.status, 401);
    const inBody = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: SECRET, email: 'body.token@example.org' }) });
    assert.equal((await inBody.json()).status, 'created');
    const none = await fetch(`${base}?email=notoken@example.org`, { method: 'POST' });
    assert.equal(none.status, 401);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(users.docs.map((d) => d.email).sort(), ['body.token@example.org', 'param.token@example.org']);
});

import { suspiciousEmailReason } from '../utils/emailQuality.js';
test('extension de domaine invalide : refusée ; extensions réelles (génériques ou pays) acceptées', () => {
  for (const bad of ['jean@gmail.comg', 'jean@gmail.cmo', 'jean@gmail.coom', 'jean@yahoo.comm', 'jean@orange.frr', 'jean@gmail.com.']) {
    assert.ok(suspiciousEmailReason(bad), `devrait être refusée : ${bad}`);
  }
  assert.equal(suspiciousEmailReason('jean@gmail.comg'), 'extension_invalide');
  for (const ok of ['sophie@gmail.com', 'sophie@orange.fr', 'sophie@harx.ai', 'sophie@entreprise.sn', 'sophie@societe.ma',
    'sophie@exemple.tn', 'sophie@univ.edu', 'sophie@boite.co.uk', 'sophie@agence.io', 'sophie@asso.org', 'sophie+tag@gmail.com']) {
    assert.equal(suspiciousEmailReason(ok), null, `devrait être acceptée : ${ok}`);
  }
});

test('adresse avec « + » dans l\'URL : conservée telle quelle, encodée (%2B) ou non', async () => {
  const users = fakeUsers();
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/zoho', createZohoWebhookRouter({ getSecret: () => SECRET, getCollection: async () => users, now: () => new Date('2026-11-15T07:00:00Z') }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/zoho/sync-user`;
  const h = { 'x-zoho-webhook-token': SECRET };
  try {
    const a = await fetch(`${base}?email=jean.dupont+test2@example.org`, { method: 'POST', headers: h });
    assert.deepEqual(await a.json(), { ok: true, status: 'created' });
    const b = await fetch(`${base}?email=marie.martin%2Btest3@example.org`, { method: 'POST', headers: h });
    assert.deepEqual(await b.json(), { ok: true, status: 'created' });
    // le corps l'emporte toujours sur l'URL
    const c = await fetch(`${base}?email=ignore+me@example.org`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'body+wins@example.org' }) });
    assert.deepEqual(await c.json(), { ok: true, status: 'created' });
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(users.docs.map((d) => d.email).sort(), ['body+wins@example.org', 'jean.dupont+test2@example.org', 'marie.martin+test3@example.org']);
});

test('multipart/form-data et texte brut (JSON ou k=v) acceptés ; 401 journalisé sans valeurs', async () => {
  const users = fakeUsers();
  const logs = [];
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/zoho', createZohoWebhookRouter({ getSecret: () => SECRET, getCollection: async () => users, log: (...a) => logs.push(a.join(' ')), now: () => new Date('2026-11-15T07:00:00Z') }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/zoho/sync-user`;
  try {
    const fd = new FormData(); fd.append('token', SECRET); fd.append('email', 'multi.part@example.org'); fd.append('first_name', 'Multi');
    assert.equal((await (await fetch(base, { method: 'POST', body: fd })).json()).status, 'created');
    const txtJson = await fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: SECRET, email: 'text.json@example.org' }) });
    assert.equal((await txtJson.json()).status, 'created');
    const txtKv = await fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: `token=${SECRET}&email=text.kv@example.org` });
    assert.equal((await txtKv.json()).status, 'created');
    const bad = new FormData(); bad.append('token', 'mauvais'); bad.append('email', 'secret.value@example.org');
    assert.equal((await fetch(base, { method: 'POST', body: bad })).status, 401);
    const file = new FormData(); file.append('f', new Blob(['x']), 'x.txt');
    assert.equal((await fetch(base, { method: 'POST', body: file })).status, 400);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(users.docs.map((d) => d.email).sort(), ['multi.part@example.org', 'text.json@example.org', 'text.kv@example.org']);
  const line = logs.find((l) => l.includes('[zoho-webhook] 401'));
  assert.ok(line, 'le 401 doit être journalisé');
  assert.ok(line.includes('multipart/form-data') && line.includes('"bodyKeys":["token","email"]'));
  assert.ok(!line.includes('mauvais') && !line.includes('secret.value'), 'aucune valeur dans le journal');
});
