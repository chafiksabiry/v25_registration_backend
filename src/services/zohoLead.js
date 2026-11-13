/**
 * Prospect (Lead) Zoho CRM créé côté serveur à chaque inscription.
 * - Désactivé par défaut : actif seulement si ZOHO_CRM_ENABLED=true ET que les accès (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET,
 *   ZOHO_REFRESH_TOKEN) sont posés.
 * - Ne bloque et ne ralentit jamais l'inscription : appel non attendu, promesse qui ne rejette jamais, nouvelles tentatives
 *   avec attente croissante, échecs seulement journalisés (aucune donnée personnelle dans le journal).
 * - Pas de doublon : recherche préalable par e-mail ; si un prospect existe, rien n'est créé.
 * - Lead_Source est toujours renseigné (ZOHO_LEAD_SOURCE, sinon « Site web HARX »).
 * Documentation de la procédure : docs/zoho-crm-leads.md.
 */

/** Centre de données -> domaines (comptes OAuth, API). */
export const DATA_CENTERS = {
  com: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com' },
  eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu' },
  in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in' },
  'com.au': { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au' },
  jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp' },
  ca: { accounts: 'https://accounts.zohocloud.ca', api: 'https://www.zohoapis.ca' },
  sa: { accounts: 'https://accounts.zoho.sa', api: 'https://www.zohoapis.sa' },
  'com.cn': { accounts: 'https://accounts.zoho.com.cn', api: 'https://www.zohoapis.com.cn' },
};

export const DEFAULT_LEAD_SOURCE = 'Site web HARX';
export const API_VERSION = 'v8';
/** Champs personnalisés à créer par un administrateur Zoho (noms d'API). */
export const CUSTOM_FIELDS = {
  accountType: 'Account_Type',
  offer: 'Offer',
  utmSource: 'UTM_Source',
  utmMedium: 'UTM_Medium',
  utmCampaign: 'UTM_Campaign',
  referrer: 'Referrer',
};

const clean = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

export function readConfig(env = process.env) {
  const dc = DATA_CENTERS[String(env.ZOHO_DC || 'com').trim().toLowerCase()];
  return {
    enabled: String(env.ZOHO_CRM_ENABLED || '').trim().toLowerCase() === 'true',
    clientId: clean(env.ZOHO_CLIENT_ID),
    clientSecret: clean(env.ZOHO_CLIENT_SECRET),
    refreshToken: clean(env.ZOHO_REFRESH_TOKEN, 500),
    dc,
    leadSource: clean(env.ZOHO_LEAD_SOURCE) || DEFAULT_LEAD_SOURCE,
  };
}

/** Corps du prospect, ou null s'il manque l'e-mail. Lead_Source est toujours présent. */
export function buildLeadRecord(input, leadSource = DEFAULT_LEAD_SOURCE) {
  const email = clean(input?.email, 320);
  if (!email) return null;
  const attribution = input.attribution || {};
  const standard = {
    Last_Name: clean(input.fullName) || email,
    Company: clean(input.companyName) || clean(input.fullName) || email,
    Email: email,
    Lead_Source: clean(leadSource) || DEFAULT_LEAD_SOURCE,
  };
  const country = clean(input.country, 100);
  if (country) standard.Country = country;
  const custom = {
    [CUSTOM_FIELDS.accountType]: clean(input.accountType, 50),
    [CUSTOM_FIELDS.offer]: clean(input.offer, 100),
    [CUSTOM_FIELDS.utmSource]: clean(attribution.utm_source, 100),
    [CUSTOM_FIELDS.utmMedium]: clean(attribution.utm_medium, 100),
    [CUSTOM_FIELDS.utmCampaign]: clean(attribution.utm_campaign, 100),
    [CUSTOM_FIELDS.referrer]: clean(attribution.referrer, 300),
  };
  Object.keys(custom).forEach((k) => custom[k] === undefined && delete custom[k]);
  return { standard, custom };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tokenCache = { token: null, expiresAt: 0 };
export const resetTokenCache = () => { tokenCache = { token: null, expiresAt: 0 }; };

class ZohoError extends Error {
  constructor(message, { retryable = false, invalidData = false } = {}) {
    super(message);
    this.retryable = retryable;
    this.invalidData = invalidData;
  }
}

async function getAccessToken(cfg, fetchImpl, now) {
  if (tokenCache.token && tokenCache.expiresAt > now() + 60_000) return tokenCache.token;
  const params = new URLSearchParams({
    refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  });
  const res = await fetchImpl(`${cfg.dc.accounts}/oauth/v2/token`, { method: 'POST', body: params });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new ZohoError(`jeton refusé (${res.status}${body?.error ? ` ${body.error}` : ''})`, { retryable: res.status >= 500 || res.status === 429 });
  tokenCache = { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

async function zohoCall(cfg, fetchImpl, now, path, init) {
  const token = await getAccessToken(cfg, fetchImpl, now);
  const res = await fetchImpl(`${cfg.dc.api}/crm/${API_VERSION}${path}`, { ...init, headers: { ...(init?.headers || {}), Authorization: `Zoho-oauthtoken ${token}` } });
  if (res.status === 401) { resetTokenCache(); throw new ZohoError('401', { retryable: true }); }
  if (res.status === 204) return { status: 204, body: null };
  const body = await res.json().catch(() => ({}));
  // Zoho répond parfois 4xx avec un code par enregistrement (ex. INVALID_DATA) : le code du corps est lu par l'appelant.
  if (!res.ok && !Array.isArray(body?.data)) throw new ZohoError(`HTTP ${res.status}${body?.code ? ` ${body.code}` : ''}`, { retryable: res.status >= 500 || res.status === 429 });
  return { status: res.status, body };
}

async function attempt(cfg, fetchImpl, now, record) {
  const found = await zohoCall(cfg, fetchImpl, now, `/Leads/search?email=${encodeURIComponent(record.standard.Email)}`);
  if (found.status !== 204 && Array.isArray(found.body?.data) && found.body.data.length) return 'duplicate';
  const post = (data) => zohoCall(cfg, fetchImpl, now, '/Leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [data] }),
  });
  const code = (r) => r.body?.data?.[0]?.code;
  let created = await post({ ...record.standard, ...record.custom });
  if (code(created) === 'INVALID_DATA' && Object.keys(record.custom).length) {
    // Champ personnalisé absent côté Zoho : on crée quand même le prospect avec les champs standard.
    console.warn('[zoho-lead] champ personnalisé refusé (INVALID_DATA) : création avec les champs standard seuls');
    created = await post(record.standard);
  }
  if (code(created) === 'DUPLICATE_DATA') return 'duplicate';
  if (code(created) !== 'SUCCESS') throw new ZohoError(`création refusée (${code(created) || 'inconnu'})`);
  return 'created';
}

/** Fire-and-forget : la promesse ne rejette jamais. */
export async function createLeadForSignup(input, { env = process.env, fetchImpl = globalThis.fetch, sleep = defaultSleep, now = Date.now, delays = [1000, 5000, 20000] } = {}) {
  try {
    const cfg = readConfig(env);
    if (!cfg.enabled) return { status: 'disabled' };
    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken || !cfg.dc) {
      console.warn('[zoho-lead] configuration incomplète : aucun prospect créé');
      return { status: 'misconfigured' };
    }
    const record = buildLeadRecord(input, cfg.leadSource);
    if (!record) return { status: 'skipped' };
    for (let i = 0; i <= delays.length; i++) {
      try {
        return { status: await attempt(cfg, fetchImpl, now, record), attempts: i + 1 };
      } catch (e) {
        const last = i === delays.length;
        // Erreur réseau (non ZohoError) : réessayable ; erreur Zoho : seulement si marquée réessayable (5xx, 429, 401).
        if ((e instanceof ZohoError && !e.retryable) || last) {
          console.error(`[zoho-lead] échec après ${i + 1} tentative(s) : ${e?.message}`);
          return { status: 'failed', attempts: i + 1 };
        }
        await sleep(delays[i]);
      }
    }
  } catch (e) {
    console.error('[zoho-lead] erreur inattendue :', e?.message);
  }
  return { status: 'failed' };
}
