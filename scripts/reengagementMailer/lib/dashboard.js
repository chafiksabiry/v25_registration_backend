// Pure helpers for the campaign dashboard: no network, no secrets, no e-mail addresses in the output.

const pct = (n, d) => (d ? n / d : null);
export const fmtPct = (r, digits = 1) => (r === null || r === undefined ? '-' : `${(r * 100).toFixed(digits)} %`);
export const fmtInt = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('fr-FR'));

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ledger entries (one per attempt) -> totals and per-day counts (UTC day). Only addresses are dropped, never kept. */
export function summarizeLedger(entries) {
  const byDay = new Map();
  const totals = { sent: 0, failed: 0 };
  const seen = new Set();
  let first = null;
  let last = null;
  for (const e of entries) {
    const status = e.status === 'sent' ? 'sent' : 'failed';
    if (status === 'sent') {
      if (seen.has(e.email)) continue;
      seen.add(e.email);
    }
    totals[status] += 1;
    const day = String(e.at || '').slice(0, 10) || 'inconnu';
    const d = byDay.get(day) || { sent: 0, failed: 0 };
    d[status] += 1;
    byDay.set(day, d);
    if (e.at && (!first || e.at < first)) first = e.at;
    if (e.at && (!last || e.at > last)) last = e.at;
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }));
  return { ...totals, days, first, last };
}

/** SES counters (sum over the period) -> rates and health against the limits used by the mailer guard. */
export function deliveryHealth({ send = 0, delivery = 0, bounce = 0, complaint = 0, reject = 0 }, limits) {
  const { maxBounce = 0.02, maxComplaint = 0.001, minSample = 100 } = limits || {};
  const bounceRate = pct(bounce, send);
  const complaintRate = pct(complaint, send);
  let state = 'ok';
  let message = 'dans les limites';
  if (send < minSample) {
    state = 'wait';
    message = `échantillon trop petit (${send} < ${minSample})`;
  } else if (bounceRate > maxBounce || complaintRate > maxComplaint) {
    state = 'stop';
    message = bounceRate > maxBounce ? `rebonds au-dessus de ${fmtPct(maxBounce)}` : `plaintes au-dessus de ${fmtPct(maxComplaint, 2)}`;
  } else if (bounceRate > maxBounce / 2 || complaintRate > maxComplaint / 2) {
    state = 'warn';
    message = 'proche des limites';
  }
  return { send, delivery, bounce, complaint, reject, deliveryRate: pct(delivery, send), bounceRate, complaintRate, state, message };
}

/**
 * Funnel from the users imported in the campaign batches.
 * users: [{ id, segment, clicked }]  agents: [{ userId, flags }]  subs: [{ userId, status }]
 * flags: { profileStarted, cv, basicProfile, photo, availability, videos, subscriptionActivated }
 */
export function buildFunnel({ users, agents, subs }) {
  const agentByUser = new Map(agents.map((a) => [String(a.userId), a.flags]));
  const subByUser = new Map();
  for (const s of subs) {
    const key = String(s.userId);
    const rank = { active: 3, trialing: 2 }[s.status] || 1;
    if (!subByUser.has(key) || rank > subByUser.get(key).rank) subByUser.set(key, { status: s.status, rank });
  }
  const steps = [
    { key: 'imported', label: 'Comptes importés', test: () => true },
    { key: 'clicked', label: 'Ont cliqué sur le lien (connexion)', test: (u) => u.clicked },
    { key: 'agent', label: 'Profil créé', test: (u) => agentByUser.has(String(u.id)) },
    { key: 'cv', label: "CV importé (expérience ajoutée)", test: (u) => agentByUser.get(String(u.id))?.cv },
    { key: 'basic', label: 'Profil validé', test: (u) => agentByUser.get(String(u.id))?.basicProfile },
    { key: 'photo', label: 'Photo en direct', test: (u) => agentByUser.get(String(u.id))?.photo },
    { key: 'availability', label: 'Créneaux de travail', test: (u) => agentByUser.get(String(u.id))?.availability },
    { key: 'plan', label: 'Formule choisie (essai ou abonnement)', test: (u) => ['trialing', 'active'].includes(subByUser.get(String(u.id))?.status) },
  ];
  const bySegment = {};
  for (const u of users) {
    const s = u.segment || '?';
    bySegment[s] = bySegment[s] || { imported: 0, clicked: 0 };
    bySegment[s].imported += 1;
    if (u.clicked) bySegment[s].clicked += 1;
  }
  const total = users.length;
  const clickedCount = users.filter((u) => u.clicked).length;
  return {
    steps: steps.map((s) => {
      const count = users.filter((u) => s.test(u)).length;
      return { key: s.key, label: s.label, count, ofImported: pct(count, total), ofClicked: s.key === 'imported' ? null : pct(count, clickedCount) };
    }),
    bySegment,
  };
}

const STATE = {
  ok: ['#15803d', 'OK'],
  warn: ['#b45309', 'ATTENTION'],
  stop: ['#b91c1c', 'ARRÊT'],
  wait: ['#64748b', 'EN ATTENTE'],
};

const tile = (label, value, sub = '') =>
  `<div class="tile"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div>${sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''}</div>`;

export function renderDashboard({ generatedAt, campaign, ledger, ses, sesDays, funnel, notes = [], limits }) {
  const parts = [];
  parts.push(`<section><h2>Envois</h2><div class="tiles">`);
  if (ledger) {
    parts.push(tile('Envoyés (journal)', fmtInt(ledger.sent), ledger.first ? `du ${ledger.first.slice(0, 10)} au ${ledger.last.slice(0, 10)}` : ''));
    parts.push(tile('Échecs (journal)', fmtInt(ledger.failed)));
  }
  if (ses) {
    const [color, label] = STATE[ses.state];
    parts.push(tile('Délivrés (SES)', fmtInt(ses.delivery), `taux ${fmtPct(ses.deliveryRate)}`));
    parts.push(tile('Rebonds', fmtInt(ses.bounce), `${fmtPct(ses.bounceRate, 2)} · arrêt à ${fmtPct(limits.maxBounce)}`));
    parts.push(tile('Plaintes', fmtInt(ses.complaint), `${fmtPct(ses.complaintRate, 3)} · arrêt à ${fmtPct(limits.maxComplaint, 2)}`));
    parts.push(`</div><p class="state" style="color:${color}"><strong>Santé de la campagne : ${label}</strong> (${escapeHtml(ses.message)})</p>`);
  } else {
    parts.push(`</div><p class="muted">Compteurs SES non lus.</p>`);
  }
  parts.push(`</section>`);

  if (sesDays?.length || ledger?.days?.length) {
    const sesMap = new Map((sesDays || []).map((d) => [d.day, d]));
    const ledMap = new Map((ledger?.days || []).map((d) => [d.day, d]));
    const days = [...new Set([...sesMap.keys(), ...ledMap.keys()])].sort();
    parts.push(`<section><h2>Par jour (UTC)</h2><table><thead><tr><th>Jour</th><th>Journal : envoyés</th><th>Échecs</th><th>SES : envoyés</th><th>Délivrés</th><th>Rebonds</th><th>Plaintes</th></tr></thead><tbody>`);
    for (const day of days) {
      const l = ledMap.get(day) || {};
      const s = sesMap.get(day) || {};
      parts.push(`<tr><td>${day}</td><td>${fmtInt(l.sent ?? 0)}</td><td>${fmtInt(l.failed ?? 0)}</td><td>${fmtInt(s.send ?? 0)}</td><td>${fmtInt(s.delivery ?? 0)}</td><td>${fmtInt(s.bounce ?? 0)}</td><td>${fmtInt(s.complaint ?? 0)}</td></tr>`);
    }
    parts.push(`</tbody></table></section>`);
  }

  if (funnel) {
    const max = funnel.steps[0]?.count || 1;
    parts.push(`<section><h2>Parcours des REPS importés</h2><p class="muted">Base : comptes des lots de la campagne. « % des cliqueurs » = part de ceux qui se sont connectés par le lien.</p><div class="funnel">`);
    for (const s of funnel.steps) {
      const w = Math.max(1, Math.round((s.count / max) * 100));
      parts.push(`<div class="row"><div class="lab">${escapeHtml(s.label)}</div><div class="bar"><span style="width:${w}%"></span></div><div class="num">${fmtInt(s.count)}</div><div class="rate">${fmtPct(s.ofImported)}${s.ofClicked === null ? '' : ` · ${fmtPct(s.ofClicked)} des cliqueurs`}</div></div>`);
    }
    parts.push(`</div>`);
    const segs = Object.entries(funnel.bySegment).sort(([a], [b]) => a.localeCompare(b));
    parts.push(`<table><thead><tr><th>Segment v1</th><th>Importés</th><th>Connectés</th><th>Taux</th></tr></thead><tbody>${segs
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${fmtInt(v.imported)}</td><td>${fmtInt(v.clicked)}</td><td>${fmtPct(pct(v.clicked, v.imported))}</td></tr>`)
      .join('')}</tbody></table></section>`);
  }

  const notesHtml = notes.length ? `<section><h2>Remarques</h2><ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></section>` : '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Suivi campagne REPS HARX</title>
<style>
:root{--bg:#fff1f2;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#fecdd3;--accent:#e11d74;--bar:#e11d74}
@media (prefers-color-scheme:dark){:root{--bg:#1a0f14;--card:#251820;--ink:#f8fafc;--muted:#a8a3b5;--line:#4a2535;--accent:#f472b6;--bar:#f472b6}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
main{max-width:980px;margin:0 auto}h1{margin:0 0 4px;font-size:24px}h2{margin:0 0 12px;font-size:17px;color:var(--accent)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}
.muted{color:var(--muted);font-size:13px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.tile{border:1px solid var(--line);border-radius:10px;padding:12px}.k{font-size:12px;color:var(--muted)}.v{font-size:26px;font-weight:700}.s{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:10px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right}th:first-child,td:first-child{text-align:left}
.funnel .row{display:grid;grid-template-columns:minmax(150px,2fr) 3fr 70px minmax(120px,2fr);gap:10px;align-items:center;padding:5px 0}
.bar{background:var(--line);height:12px;border-radius:6px;overflow:hidden}.bar span{display:block;height:100%;background:var(--bar)}
.num{text-align:right;font-weight:700}.rate{font-size:12px;color:var(--muted)}
@media(max-width:640px){.funnel .row{grid-template-columns:1fr 70px}.funnel .bar,.funnel .rate{grid-column:1/-1}}
</style></head><body><main>
<h1>Suivi de la campagne REPS</h1>
<p class="muted">Campagne « ${escapeHtml(campaign)} » · généré le ${escapeHtml(generatedAt)} · aucune adresse e-mail dans cette page</p>
${parts.join('\n')}
${notesHtml}
</main></body></html>
`;
}
