/** Planning des agents et demandes d'absence : contrôles purs (sans base de données). */

export const REQUEST_KINDS = ['leave', 'sick', 'absence', 'late_arrival', 'early_departure', 'other'];
export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
export const KINDS_WITH_TIME = ['late_arrival', 'early_departure'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDate = (v) => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const isTime = (v) => typeof v === 'string' && TIME_RE.test(v);
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const addDays = (date, n) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export const MAX_REQUEST_DAYS = 120;
export const MAX_PAST_DAYS = 30;
export const MAX_SHIFTS = 400;

/**
 * Demande de l'agent : un type, des dates, une heure pour une arrivée tardive ou une sortie anticipée, un motif.
 * `today` (AAAA-MM-JJ) est passé par l'appelant pour rester testable.
 */
export function normalizeRequestInput(body, today) {
  const errors = [];
  const kind = String(body?.kind || '');
  if (!REQUEST_KINDS.includes(kind)) errors.push('Le type de demande est invalide.');
  const startDate = String(body?.startDate || '');
  if (!isDate(startDate)) errors.push('La date de début est invalide.');
  let endDate = body?.endDate ? String(body.endDate) : startDate;
  if (!isDate(endDate)) errors.push('La date de fin est invalide.');
  const withTime = KINDS_WITH_TIME.includes(kind);
  if (withTime) endDate = startDate;
  if (isDate(startDate) && isDate(endDate)) {
    if (endDate < startDate) errors.push('La date de fin précède la date de début.');
    if (dayDiff(startDate, endDate) + 1 > MAX_REQUEST_DAYS) errors.push(`Une demande ne peut pas dépasser ${MAX_REQUEST_DAYS} jours.`);
    if (isDate(today) && dayDiff(startDate, today) > MAX_PAST_DAYS) errors.push(`Une demande ne peut pas remonter à plus de ${MAX_PAST_DAYS} jours.`);
  }
  let time = null;
  if (withTime) {
    time = String(body?.time || '');
    if (!isTime(time)) errors.push(kind === 'late_arrival' ? 'L’heure d’arrivée prévue est obligatoire (HH:MM).' : 'L’heure de départ prévue est obligatoire (HH:MM).');
  }
  const reason = String(body?.reason ?? '').trim();
  if (reason.length > 500) errors.push('Le motif ne peut pas dépasser 500 caractères.');
  if (kind === 'other' && !reason) errors.push('Précisez le motif de votre demande.');
  return { errors, value: { kind, startDate, endDate, time: withTime ? time : null, reason } };
}

/** Créneaux d'un agent sur une période : remplace tout ce qui existait dans [from, to]. */
export function normalizeShiftsInput(body) {
  const errors = [];
  const from = String(body?.from || '');
  const to = String(body?.to || '');
  if (!isDate(from) || !isDate(to)) errors.push('La période est invalide.');
  else if (to < from) errors.push('La fin de la période précède son début.');
  else if (dayDiff(from, to) > 366) errors.push('La période ne peut pas dépasser un an.');
  const list = Array.isArray(body?.shifts) ? body.shifts : null;
  if (!list) errors.push('La liste des créneaux est obligatoire.');
  const shifts = [];
  if (list) {
    if (list.length > MAX_SHIFTS) errors.push(`Au plus ${MAX_SHIFTS} créneaux par envoi.`);
    for (const s of list) {
      const date = String(s?.date || '');
      const startTime = String(s?.startTime || '');
      const endTime = String(s?.endTime || '');
      if (!isDate(date) || !isTime(startTime) || !isTime(endTime)) { errors.push('Chaque créneau demande une date et deux heures valides.'); break; }
      if (toMinutes(endTime) <= toMinutes(startTime)) { errors.push(`Le créneau du ${date} doit finir après son début.`); break; }
      if (!errors.length && (date < from || date > to)) { errors.push(`Le créneau du ${date} sort de la période.`); break; }
      shifts.push({ date, startTime, endTime, gigId: s?.gigId ? String(s.gigId) : null });
    }
    const byDay = new Map();
    for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) || []), s]);
    for (const [date, day] of byDay) {
      const sorted = [...day].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
      for (let i = 1; i < sorted.length; i += 1) {
        if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) { errors.push(`Deux créneaux se chevauchent le ${date}.`); break; }
      }
    }
  }
  return { errors, value: { from, to, shifts } };
}

/** Réponse du centre à une demande. */
export function normalizeDecisionInput(body) {
  const errors = [];
  const decision = String(body?.decision || '');
  if (!['approved', 'rejected'].includes(decision)) errors.push('La décision doit être « approved » ou « rejected ».');
  const note = String(body?.note ?? '').trim();
  if (note.length > 300) errors.push('La réponse ne peut pas dépasser 300 caractères.');
  return { errors, value: { decision, note } };
}

export const requestView = (r) => ({
  id: String(r._id),
  userId: String(r.userId),
  userName: r.userName || '',
  kind: r.kind,
  startDate: r.startDate,
  endDate: r.endDate,
  time: r.time || null,
  reason: r.reason || '',
  status: r.status,
  decisionNote: r.decisionNote || '',
  decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null,
  createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
});

export const shiftView = (s) => ({
  id: String(s._id),
  userId: String(s.userId),
  date: s.date,
  startTime: s.startTime,
  endTime: s.endTime,
  gigId: s.gigId ? String(s.gigId) : null,
});

export { addDays };
