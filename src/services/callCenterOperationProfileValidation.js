/** Validation et normalisation de la fiche d'une opération et de ses indicateurs de pilotage (pure, testable sans base). */

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const MAX_KPIS = 20;

export function normalizeProfileInput(body) {
  const errors = [];
  const value = {};
  const has = (k) => body && Object.prototype.hasOwnProperty.call(body, k);

  if (has('objective')) value.objective = str(body.objective, 2000);
  if (has('dailyVolume')) {
    if (body.dailyVolume === null || body.dailyVolume === '') value.dailyVolume = null;
    else {
      const n = Number(body.dailyVolume);
      if (!Number.isFinite(n) || n < 0) errors.push('Le volume quotidien attendu doit être un nombre positif.');
      else value.dailyVolume = Math.round(n);
    }
  }
  if (has('kpis')) {
    if (!Array.isArray(body.kpis)) errors.push('Les indicateurs doivent être une liste.');
    else if (body.kpis.length > MAX_KPIS) errors.push(`Au plus ${MAX_KPIS} indicateurs par opération.`);
    else {
      const seen = new Set();
      value.kpis = [];
      for (const k of body.kpis) {
        const id = str(k?.id, 40);
        const label = str(k?.label, 80);
        if (!id || !label) { errors.push('Chaque indicateur porte un identifiant et un libellé.'); continue; }
        if (seen.has(id)) { errors.push(`Indicateur en double : ${label}.`); continue; }
        seen.add(id);
        let target = null;
        if (k.target !== null && k.target !== undefined && k.target !== '') {
          target = Number(k.target);
          if (!Number.isFinite(target)) { errors.push(`Objectif invalide pour « ${label} ».`); continue; }
        }
        value.kpis.push({ id, label, unit: str(k.unit, 12), target, goal: k.goal === 'max' ? 'max' : 'min', custom: Boolean(k.custom) });
      }
    }
  }
  return { errors, value };
}

export function profileView(doc) {
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    gigId: String(d.gigId),
    objective: d.objective ?? '',
    dailyVolume: d.dailyVolume ?? null,
    kpis: (d.kpis ?? []).map((k) => ({ id: k.id, label: k.label, unit: k.unit ?? '', target: k.target ?? null, goal: k.goal === 'max' ? 'max' : 'min', custom: Boolean(k.custom) })),
  };
}
