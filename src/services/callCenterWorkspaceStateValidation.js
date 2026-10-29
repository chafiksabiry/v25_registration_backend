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

/** Identité du centre saisie à la mise en route (affichée dans le profil) : texte borné, justificatifs réduits à leur nom. */
function normalizeProfile(p) {
  if (!isObj(p)) return { error: 'Le profil du centre doit être un objet.' };
  const out = {
    name: str(p.name, 120),
    siren: str(p.siren, 40),
    representativeEmail: str(p.representativeEmail, 160),
    kybStatus: p.kybStatus === 'submitted' ? 'submitted' : 'draft',
    documents: (Array.isArray(p.documents) ? p.documents : []).slice(0, 20).map((d) => ({ name: str(d?.name, 160), size: Math.max(0, num(d?.size) ?? 0), ...(d?.kind ? { kind: str(d.kind, 40) } : {}) })).filter((d) => d.name),
  };
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

/** Un agent n'enregistre que ses propres préférences : l'état partagé du centre n'est pas de son ressort. */
export function writableParts(access, value) {
  if (access !== 'agent') return value;
  const { company: _ignored, ...own } = value;
  return own;
}
