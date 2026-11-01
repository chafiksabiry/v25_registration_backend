import assert from 'node:assert/strict';
import { MAX_REQUEST_DAYS, isDate, isTime, normalizeDecisionInput, normalizeRequestInput, normalizeShiftsInput, requestView, shiftView } from '../services/callCenterScheduleValidation.js';

const today = '2026-11-02';

// dates et heures
assert.equal(isDate('2026-11-02'), true);
assert.equal(isDate('2026-02-30'), false);
assert.equal(isDate('02/11/2026'), false);
assert.equal(isTime('09:30'), true);
assert.equal(isTime('24:00'), false);
assert.equal(isTime('9:30'), false);

// demande : congé sur plusieurs jours
let r = normalizeRequestInput({ kind: 'leave', startDate: '2026-11-10', endDate: '2026-11-14', reason: ' Vacances ' }, today);
assert.deepEqual(r.errors, []);
assert.deepEqual(r.value, { kind: 'leave', startDate: '2026-11-10', endDate: '2026-11-14', time: null, reason: 'Vacances' });
// fin par défaut = début
assert.equal(normalizeRequestInput({ kind: 'sick', startDate: '2026-11-02' }, today).value.endDate, '2026-11-02');
// arrivée tardive et sortie anticipée : une heure, un seul jour
r = normalizeRequestInput({ kind: 'late_arrival', startDate: '2026-11-03', endDate: '2026-11-09', time: '10:30' }, today);
assert.deepEqual(r.errors, []);
assert.deepEqual([r.value.endDate, r.value.time], ['2026-11-03', '10:30']);
assert.match(normalizeRequestInput({ kind: 'late_arrival', startDate: '2026-11-03' }, today).errors[0], /arrivée/);
assert.match(normalizeRequestInput({ kind: 'early_departure', startDate: '2026-11-03', time: 'xx' }, today).errors[0], /départ/);
// l'heure n'est pas retenue pour les autres types
assert.equal(normalizeRequestInput({ kind: 'absence', startDate: '2026-11-03', time: '10:00' }, today).value.time, null);
// refus
assert.ok(normalizeRequestInput({ kind: 'vacances', startDate: '2026-11-03' }, today).errors.length);
assert.ok(normalizeRequestInput({ kind: 'leave', startDate: '2026-11-10', endDate: '2026-11-09' }, today).errors.some((e) => /précède/.test(e)));
assert.ok(normalizeRequestInput({ kind: 'leave', startDate: '2026-11-01', endDate: '2027-06-01' }, today).errors.some((e) => new RegExp(String(MAX_REQUEST_DAYS)).test(e)));
assert.ok(normalizeRequestInput({ kind: 'sick', startDate: '2026-09-01' }, today).errors.some((e) => /remonter/.test(e)));
assert.equal(normalizeRequestInput({ kind: 'sick', startDate: '2026-10-20' }, today).errors.length, 0, 'une maladie déclarée après coup reste possible');
assert.ok(normalizeRequestInput({ kind: 'other', startDate: '2026-11-03' }, today).errors.some((e) => /motif/.test(e)));
assert.ok(normalizeRequestInput({ kind: 'sick', startDate: '2026-11-03', reason: 'x'.repeat(501) }, today).errors.some((e) => /500/.test(e)));
assert.ok(normalizeRequestInput(null, today).errors.length);

// créneaux
let s = normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06', shifts: [{ date: '2026-11-02', startTime: '09:00', endTime: '12:00' }, { date: '2026-11-02', startTime: '14:00', endTime: '18:00', gigId: 'g1' }, { date: '2026-11-03', startTime: '09:00', endTime: '17:00' }] });
assert.deepEqual(s.errors, []);
assert.equal(s.value.shifts.length, 3);
assert.equal(s.value.shifts[1].gigId, 'g1');
assert.deepEqual(normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06', shifts: [] }).errors, [], 'une liste vide efface la période');
assert.ok(normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06', shifts: [{ date: '2026-11-02', startTime: '12:00', endTime: '09:00' }] }).errors.some((e) => /finir après/.test(e)));
assert.ok(normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06', shifts: [{ date: '2026-11-09', startTime: '09:00', endTime: '10:00' }] }).errors.some((e) => /sort de la période/.test(e)));
assert.ok(normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06', shifts: [{ date: '2026-11-02', startTime: '09:00', endTime: '12:00' }, { date: '2026-11-02', startTime: '11:00', endTime: '13:00' }] }).errors.some((e) => /chevauchent/.test(e)));
assert.ok(normalizeShiftsInput({ from: '2026-11-06', to: '2026-11-02', shifts: [] }).errors.length);
assert.ok(normalizeShiftsInput({ from: '2026-11-02', to: '2026-11-06' }).errors.some((e) => /liste/.test(e)));

// décision
assert.deepEqual(normalizeDecisionInput({ decision: 'approved', note: ' ok ' }).value, { decision: 'approved', note: 'ok' });
assert.ok(normalizeDecisionInput({ decision: 'maybe' }).errors.length);
assert.ok(normalizeDecisionInput({ decision: 'rejected', note: 'x'.repeat(301) }).errors.length);

// vues
assert.equal(requestView({ _id: 'r1', userId: 'u1', kind: 'leave', startDate: '2026-11-10', endDate: '2026-11-10', status: 'pending' }).id, 'r1');
assert.deepEqual(shiftView({ _id: 's1', userId: 'u1', date: '2026-11-02', startTime: '09:00', endTime: '12:00' }), { id: 's1', userId: 'u1', date: '2026-11-02', startTime: '09:00', endTime: '12:00', gigId: null });

console.log('callCenterScheduleValidation OK');
