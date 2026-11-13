import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeadForSignup, buildLeadRecord, readConfig, resetTokenCache } from '../services/zohoLead.js';

const env = { ZOHO_CRM_ENABLED: 'true', ZOHO_CLIENT_ID: 'id', ZOHO_CLIENT_SECRET: 'sec', ZOHO_REFRESH_TOKEN: 'rt', ZOHO_DC: 'eu', ZOHO_LEAD_SOURCE: 'Web HARX' };
const input = { email: 'a@b.fr', fullName: 'Ana B', companyName: 'Acme', country: 'France', accountType: 'company', offer: 'accueil', attribution: { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'c1', referrer: 'linkedin.com' } };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const noSleep = async () => {};

/** Client Zoho simulé : jamais d'appel réseau réel. */
function mock({ search = () => json(204), create = () => json(201, { data: [{ code: 'SUCCESS' }] }) } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('/oauth/v2/token')) return json(200, { access_token: 'at', expires_in: 3600 });
    if (url.includes('/Leads/search')) return search(calls);
    return create(calls);
  };
  return { f, calls };
}
const posts = (calls) => calls.filter((c) => c.init.method === 'POST' && c.url.endsWith('/Leads'));

test('désactivé par défaut : aucun appel', async () => {
  resetTokenCache();
  const m = mock();
  assert.deepEqual(await createLeadForSignup(input, { env: {}, fetchImpl: m.f }), { status: 'disabled' });
  assert.equal((await createLeadForSignup(input, { env: { ...env, ZOHO_CRM_ENABLED: 'false' }, fetchImpl: m.f })).status, 'disabled');
  assert.equal(m.calls.length, 0);
});

test('configuration incomplète ou centre inconnu : rien n\'est envoyé', async () => {
  const m = mock();
  assert.equal((await createLeadForSignup(input, { env: { ...env, ZOHO_REFRESH_TOKEN: '' }, fetchImpl: m.f })).status, 'misconfigured');
  assert.equal((await createLeadForSignup(input, { env: { ...env, ZOHO_DC: 'xx' }, fetchImpl: m.f })).status, 'misconfigured');
  assert.equal(m.calls.length, 0);
});

test('création : champs, Lead_Source, domaine du centre de données', async () => {
  resetTokenCache();
  const m = mock();
  const r = await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: noSleep });
  assert.equal(r.status, 'created');
  assert.ok(m.calls[0].url.startsWith('https://accounts.zoho.eu/oauth/v2/token'));
  const p = posts(m.calls)[0];
  assert.ok(p.url.startsWith('https://www.zohoapis.eu/crm/v8/Leads'));
  assert.equal(p.init.headers.Authorization, 'Zoho-oauthtoken at');
  const rec = JSON.parse(p.init.body).data[0];
  assert.deepEqual(rec, { Last_Name: 'Ana B', Company: 'Acme', Email: 'a@b.fr', Lead_Source: 'Web HARX', Country: 'France', Account_Type: 'company', Offer: 'accueil', UTM_Source: 'linkedin', UTM_Medium: 'social', UTM_Campaign: 'c1' });  // le referrer n'est pas envoyé (décision propriétaire en cours)
});

test('Lead_Source toujours renseigné, même sans variable ni origine', () => {
  const r = buildLeadRecord({ email: 'x@y.z' }, undefined);
  assert.equal(r.standard.Lead_Source, 'Site web HARX');
  assert.equal(readConfig({}).leadSource, 'Site web HARX');
  assert.equal(readConfig({ ZOHO_LEAD_SOURCE: '  ' }).leadSource, 'Site web HARX');
  assert.equal(buildLeadRecord({ email: '' }), null);
});

test('pas de doublon : prospect trouvé par e-mail, rien n\'est créé', async () => {
  resetTokenCache();
  const m = mock({ search: () => json(200, { data: [{ id: '1' }] }) });
  assert.equal((await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: noSleep })).status, 'duplicate');
  assert.equal(posts(m.calls).length, 0);
  assert.ok(m.calls.find((c) => c.url.includes('/Leads/search?email=a%40b.fr')));
});

test('nouvelle tentative avec attente croissante sur erreur serveur, puis succès', async () => {
  resetTokenCache();
  let n = 0;
  const m = mock({ create: () => (++n < 3 ? json(503, {}) : json(201, { data: [{ code: 'SUCCESS' }] })) });
  const waits = [];
  const r = await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: async (ms) => waits.push(ms) });
  assert.equal(r.status, 'created');
  assert.deepEqual(waits, [1000, 5000]);
});

test('échec définitif : journalisé, ne rejette jamais, nombre de tentatives borné', async () => {
  resetTokenCache();
  const f = async () => { throw new Error('réseau coupé'); };
  const waits = [];
  const r = await createLeadForSignup(input, { env, fetchImpl: f, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { status: 'failed', attempts: 4 });
  assert.deepEqual(waits, [1000, 5000, 20000]);
});

test('erreur Zoho définitive (400) : pas de nouvelle tentative', async () => {
  resetTokenCache();
  const m = mock({ create: () => json(400, { code: 'INVALID_TOKEN' }) });
  const waits = [];
  assert.equal((await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: async (ms) => waits.push(ms) })).status, 'failed');
  assert.equal(waits.length, 0);
});

test('champ personnalisé inconnu de Zoho : création avec les champs standard', async () => {
  resetTokenCache();
  let n = 0;
  const m = mock({ create: () => (++n === 1 ? json(400, { data: [{ code: 'INVALID_DATA' }] }) : json(201, { data: [{ code: 'SUCCESS' }] })) });
  assert.equal((await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: noSleep })).status, 'created');
  const second = JSON.parse(posts(m.calls)[1].init.body).data[0];
  assert.equal(second.Lead_Source, 'Web HARX');
  assert.ok(!('Offer' in second));
});

test('le secret et l\'e-mail ne sont jamais écrits dans le journal', async () => {
  resetTokenCache();
  const lines = [];
  const orig = [console.error, console.warn];
  console.error = console.warn = (...a) => lines.push(a.join(' '));
  try {
    await createLeadForSignup(input, { env, fetchImpl: async () => { throw new Error('boom'); }, sleep: noSleep, delays: [] });
  } finally { [console.error, console.warn] = orig; }
  assert.ok(lines.length && lines.every((l) => !l.includes('sec') || !l.includes('a@b.fr')));
  assert.ok(!lines.join('').includes('a@b.fr'));
});

test('portée manquante (401 OAUTH_SCOPE_MISMATCH) : journalisé, aucune nouvelle tentative', async () => {
  resetTokenCache();
  const m = mock({ search: () => json(401, { code: 'OAUTH_SCOPE_MISMATCH' }) });
  const waits = [];
  const r = await createLeadForSignup(input, { env, fetchImpl: m.f, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { status: 'failed', attempts: 1 });
  assert.equal(waits.length, 0);
});
