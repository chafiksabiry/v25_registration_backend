/** Validation et normalisation de l'état du portail Call Centre conservé côté serveur (pure, testable sans base). */

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_QUEUES = 50;
const MAX_LINES = 100;
const STEP_IDS = ['company', 'team', 'plan', 'telephony', 'test'];
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);

function normalizeQueues(list) {
  if (!Array.isArray(list)) return { error: 'Les files doivent être une liste.' };
  if (list.length > MAX_QUEUES) return { error: `Au plus ${MAX_QUEUES} files.` };
  const out = [];
  for (const q of list) {
    const id = str(q?.id, 60);
    const name = str(q?.name, 80);
    if (!id || !name) continue;
    const queue = {
      id,
      name,
      direction: q.direction === 'outbound' ? 'outbound' : 'inbound',
      strategy: q.strategy === 'round_robin' ? 'round_robin' : 'longest_idle',
      createdAt: str(q.createdAt, 40),
    };
    if (typeof q.greeting === 'string') queue.greeting = str(q.greeting, 1000);
    out.push(queue);
  }
  return { value: out };
}

function normalizeLines(map, fields) {
  if (!isObj(map)) return { error: 'Les lignes testées doivent être un objet.' };
  const keys = Object.keys(map).slice(0, MAX_LINES);
  const out = {};
  for (const k of keys) {
    const e164 = str(k, 20);
    if (!/^\+?\d{6,15}$/.test(e164) || !isObj(map[k])) continue;
    out[e164] = { at: str(map[k].at, 40) };
    for (const f of fields) out[e164][f] = str(map[k][f], 30);
  }
  return { value: out };
}

function normalizeOnboarding(o) {
  if (!isObj(o)) return { error: 'La mise en route doit être un objet.' };
  const timings = {};
  for (const id of STEP_IDS) {
    const t = o.timings?.[id];
    if (!isObj(t)) continue;
    const entry = {};
    const startedAt = num(t.startedAt);
    const completedAt = num(t.completedAt);
    const activeMs = num(t.activeMs);
    if (startedAt !== undefined) entry.startedAt = startedAt;
    if (completedAt !== undefined) entry.completedAt = completedAt;
    if (activeMs !== undefined) entry.activeMs = Math.max(0, activeMs);
    timings[id] = entry;
  }
  return { value: { done: Boolean(o.done), currentStep: STEP_IDS.includes(o.currentStep) ? o.currentStep : STEP_IDS[0], timings } };
}

/** Codes réservés ou non ISO que `Intl.DisplayNames` accepte malgré tout. */
const NON_ISO_REGIONS = new Set(['ZZ', 'UK', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB']);
let regionNamesCache;
const regionNames = () => {
  if (regionNamesCache !== undefined) return regionNamesCache;
  try {
    regionNamesCache = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  } catch {
    regionNamesCache = null;
  }
  return regionNamesCache;
};

/** Code pays ISO 3166-1 alpha-2 (mis en majuscules) ; undefined s'il est absent ou inconnu. */
export function isoCountry(v) {
  if (typeof v !== 'string') return undefined;
  const cc = v.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || NON_ISO_REGIONS.has(cc)) return undefined;
  const names = regionNames();
  if (names) {
    try {
      if (!names.of(cc)) return undefined;
    } catch {
      return undefined;
    }
  }
  return cc;
}

function normalizeDocument(d) {
  const doc = { name: str(d?.name, 160), size: Math.max(0, num(d?.size) ?? 0) };
  if (d?.kind) doc.kind = str(d.kind, 40);
  const issuingCountry = isoCountry(d?.issuingCountry);
  if (issuingCountry) doc.issuingCountry = issuingCountry;
  return doc;
}

/**
 * Identité du centre saisie à la mise en route (affichée dans le profil) : texte borné, justificatifs réduits à leur nom.
 * `identityCountry` (pays de la pièce d'identité) et `documents[].issuingCountry` : code ISO alpha-2 validé, ignoré sinon ;
 * l'orchestrateur les relit pour l'éligibilité Nomad Solo (numéro FR/GB/US pour un titulaire d'une pièce de ce pays).
 */
function normalizeProfile(p) {
  if (!isObj(p)) return { error: 'Le profil du centre doit être un objet.' };
  const out = {
    name: str(p.name, 120),
    siren: str(p.siren, 40),
    representativeEmail: str(p.representativeEmail, 160),
    kybStatus: p.kybStatus === 'submitted' ? 'submitted' : 'draft',
    documents: (Array.isArray(p.documents) ? p.documents : []).slice(0, 20).map(normalizeDocument).filter((d) => d.name),
  };
  const identityCountry = isoCountry(p.identityCountry);
  if (identityCountry) out.identityCountry = identityCountry;
  const phone = String(p.phone ?? '').replace(/[\s().-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(phone)) out.phone = phone;
  if (typeof p.country === 'string') out.country = str(p.country, 4).toUpperCase();
  if (isObj(p.address)) out.address = { street: str(p.address.street, 200), postalCode: str(p.address.postalCode, 20), city: str(p.address.city, 100) };
  return { value: out };
}

function normalizeTestCall(t) {
  if (!isObj(t)) return { error: 'L’appel de test doit être un objet.' };
  return { value: { at: str(t.at, 40), from: str(t.from, 30), to: str(t.to, 30) } };
}

/** @returns {{ value: { company?: object, user?: object }, errors: string[] }} */
export function normalizeWorkspaceInput(body) {
  const errors = [];
  const value = {};
  const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

  if (has(body, 'company')) {
    if (!isObj(body.company)) errors.push('La partie « centre » doit être un objet.');
    else {
      const c = {};
      const take = (key, fn) => {
        if (!has(body.company, key)) return;
        const r = fn(body.company[key]);
        if (r.error) errors.push(r.error);
        else c[key] = r.value;
      };
      take('queues', normalizeQueues);
      take('testedLines', (m) => normalizeLines(m, ['to']));
      take('inboundTestedLines', (m) => normalizeLines(m, ['from']));
      take('onboarding', normalizeOnboarding);
      take('profile', normalizeProfile);
      take('testCall', normalizeTestCall);
      take('clientScreen', normalizeClientScreen);
      if (has(body.company, 'testCallOk')) c.testCallOk = Boolean(body.company.testCallOk);
      value.company = c;
    }
  }

  if (has(body, 'user')) {
    if (!isObj(body.user)) errors.push('La partie « personne » doit être un objet.');
    else {
      const u = {};
      if (has(body.user, 'academy')) {
        const a = body.user.academy;
        u.academy = {
          done: Array.isArray(a?.done) ? a.done.filter((x) => typeof x === 'string').map((x) => str(x, 60)).slice(0, 100) : [],
          welcomeDismissed: Boolean(a?.welcomeDismissed),
        };
      }
      if (has(body.user, 'activeOperationId')) {
        const id = body.user.activeOperationId;
        u.activeOperationId = id === null || id === '' ? null : /^[a-f\d]{24}$/i.test(String(id)) ? String(id) : null;
      }
      value.user = u;
    }
  }
  return { value, errors };
}

const MAX_CLIENT_DOMAINS = 50;
const MAX_CLIENT_OPERATIONS = 200;
const MAX_CLIENT_URL = 2000;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MARKER_RE = /\{([a-z_]+)\}/g;
const MARKERS = ['telephone', 'nom', 'reference_appel'];

/** Domaine autorisé : « crm.client.fr » ou « *.client.fr » ; null sinon (pas d'adresse IP, pas de schéma autre que https). */
function normalizeClientDomain(v) {
  let d = String(v ?? '').trim().toLowerCase().replace(/^https:\/\//, '');
  if (/^[a-z][a-z0-9+.-]*:/.test(d)) return null;
  d = d.split(/[/?#]/)[0];
  const wildcard = d.startsWith('*.');
  const host = wildcard ? d.slice(2) : d;
  if (!HOST_RE.test(host) || /^\d+(\.\d+)+$/.test(host)) return null;
  return wildcard ? `*.${host}` : host;
}

/** Modèle d'adresse de l'écran client : https obligatoire, marqueurs connus seulement et jamais dans le nom d'hôte, sans identifiants ni port. */
function isValidClientUrl(url) {
  if (typeof url !== 'string' || url.length > MAX_CLIENT_URL) return false;
  if (!/^https:\/\//i.test(url) || /[\s<>"'`\\\u0000-\u001f]/.test(url)) return false;
  if ([...url.matchAll(MARKER_RE)].some((m) => !MARKERS.includes(m[1]))) return false;
  if (/[{}]/.test(url.replace(MARKER_RE, ''))) return false;
  const authority = url.slice('https://'.length).split(/[/?#]/)[0];
  if (authority.includes('{') || authority.includes('@')) return false;
  try {
    const u = new URL(url.replace(MARKER_RE, 'x'));
    return u.protocol === 'https:' && !u.port && HOST_RE.test(u.hostname);
  } catch { return false; }
}

/** Écran client (iframe du client pendant l'appel) : domaines autorisés du centre + adresse par opération. */
function normalizeClientScreen(c) {
  if (!isObj(c)) return { error: 'L’écran client doit être un objet.' };
  const domains = [];
  for (const raw of Array.isArray(c.domains) ? c.domains : []) {
    const d = normalizeClientDomain(raw);
    if (d && !domains.includes(d)) domains.push(d);
    if (domains.length >= MAX_CLIENT_DOMAINS) break;
  }
  const byOperation = {};
  if (isObj(c.byOperation)) {
    for (const [gigId, v] of Object.entries(c.byOperation).slice(0, MAX_CLIENT_OPERATIONS)) {
      if (!/^[a-f\d]{24}$/i.test(gigId) || !isObj(v)) continue;
      const url = String(v.url ?? '').trim();
      if (isValidClientUrl(url)) byOperation[gigId] = { url };
    }
  }
  return { value: { domains, byOperation } };
}

/**
 * Un agent n'enregistre que ses propres préférences : l'état partagé du centre n'est pas de son ressort. Un membre de
 * l'équipe écrit l'état du centre sauf l'identité (`profile` : société, coordonnées, justificatifs), réservée au titulaire.
 */
export function writableParts(access, value) {
  if (access === 'agent') {
    const { company: _ignored, ...own } = value;
    return own;
  }
  if (access === 'member' && value.company && 'profile' in value.company) {
    const { profile: _profile, ...company } = value.company;
    return { ...value, company };
  }
  return value;
}
